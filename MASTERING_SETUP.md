# Studio Mix & Master — Setup Guide

This file lists everything you need to click and configure to take the
mastering service live. The code is in place. The infrastructure isn't,
because Cloudflare bindings + Stripe products + Resend domain + Oracle
VPS all need to be created in dashboards, not via git.

Estimated total time: 60-90 minutes.

## 1. Cloudflare D1 database (5 min)

```
wrangler d1 create flotion-mastering
```

Copy the `database_id` from the output and paste it into `wrangler.jsonc`
where it says `REPLACE_WITH_D1_DATABASE_ID`.

Apply the schema:

```
wrangler d1 execute flotion-mastering --remote --file=./schema.sql
```

## 2. Cloudflare R2 bucket (3 min)

In Cloudflare dashboard -> R2 -> Create bucket. Name: `flotion-mastering-audio`.
That's it. The binding name `AUDIO` in wrangler.jsonc maps to this bucket
automatically.

## 3. Cloudflare Turnstile (3 min)

dash.cloudflare.com -> Turnstile -> Add a site.
- Hostname: flotionrecords.com
- Widget mode: Managed (invisible to most users)

Copy the **site key**, paste it into `account.html` where it says
`0x4AAAAAAA_REPLACE_WITH_TURNSTILE_KEY`. Copy the **secret key**, save
for step 6.

## 4. Resend (5 min)

resend.com (100 emails/day free).
- Verify the flotionrecords.com domain (add the DNS records Resend gives
  you). Once verified you can send from any address @flotionrecords.com.
- Create an API key.

## 5. Stripe products (10 min)

dashboard.stripe.com -> Products -> Add product.

Create three products with one price each:

| Product             | Price |
|---------------------|-------|
| Mastering Single    | €7    |
| Mastering 5-Pack    | €25   |
| Mastering WAV Unlock| €7    |

For each, copy the `price_xxx` ID. Save these for step 6.

Also add a webhook endpoint:
- URL: `https://flotionrecords.com/api/stripe-webhook`
- Event: `checkout.session.completed`
- Copy the webhook signing secret.

## 6. Cloudflare Pages env vars (5 min)

dash.cloudflare.com -> Pages -> flotionrecords -> Settings -> Environment variables.

Add as **Secrets** (encrypted):

| Variable                   | Value                                  |
|----------------------------|----------------------------------------|
| STRIPE_SECRET_KEY          | `sk_live_...`                          |
| STRIPE_WEBHOOK_SECRET      | `whsec_...` (from step 5)              |
| STRIPE_PRICE_SINGLE        | `price_...` for €7 single              |
| STRIPE_PRICE_PACK          | `price_...` for €25 pack               |
| STRIPE_PRICE_WAV_UNLOCK    | `price_...` for €7 WAV unlock          |
| TURNSTILE_SECRET           | secret from step 3                     |
| RESEND_API_KEY             | from step 4                            |
| WORKER_SHARED_SECRET       | invent a random 32+ char string        |
| SESSION_SECRET             | invent another random 32+ char string  |

Add as **Plain text**:

| Variable           | Value                                          |
|--------------------|------------------------------------------------|
| SITE_URL           | `https://flotionrecords.com`                   |
| RESEND_FROM        | `Flotion Records <hello@flotionrecords.com>`   |
| FORMSPREE_ENDPOINT | `https://formspree.io/f/xeenlknb`              |

Retry the latest deployment so the new vars are picked up.

## 7. Oracle Cloud Always Free VPS (30 min)

cloud.oracle.com -> Sign up (no card auto-charge, Always Free is separate
from the 30-day trial).

Create an Always Free ARM compute instance (Ampere A1):
- 4 OCPU, 24 GB RAM
- Ubuntu 22.04
- Region: pick one where capacity is available (try Frankfurt, Amsterdam,
  Phoenix or São Paulo)

SSH in and install dependencies:

```
sudo apt update && sudo apt install -y python3-venv python3-pip ffmpeg git
git clone https://github.com/sambakels/lofi-studio.git ~/lofi-studio
git clone https://github.com/sambakels/flotionrecords.git ~/flotionrecords
cd ~/lofi-studio
python3 -m venv venv
. venv/bin/activate
pip install -r requirements.txt
pip install -r ~/flotionrecords/worker/requirements.txt
```

Create the env file at `~/.flotion-worker.env`:

```
FLOTION_API_URL=https://flotionrecords.com
WORKER_SHARED_SECRET=<same string you used in step 6>
LOFI_STUDIO_PATH=/home/ubuntu/lofi-studio
POLL_INTERVAL_SECONDS=15
```

Add a systemd unit at `/etc/systemd/system/flotion-worker.service`:

```
[Unit]
Description=Flotion Mastering Worker
After=network.target

[Service]
Type=simple
User=ubuntu
EnvironmentFile=/home/ubuntu/.flotion-worker.env
WorkingDirectory=/home/ubuntu/flotionrecords/worker
ExecStart=/home/ubuntu/lofi-studio/venv/bin/python /home/ubuntu/flotionrecords/worker/worker.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```
sudo systemctl daemon-reload
sudo systemctl enable --now flotion-worker
sudo systemctl status flotion-worker
```

## 8. Test the full flow (5 min)

1. Open `https://flotionrecords.com/services#mastering` -> click "Try Free"
2. Enter a real email, complete Turnstile, submit
3. Check your inbox for the sign-in link, click it
4. You land on `/mastering`, see "1 free preview available"
5. Drag a track in, pick a genre, click "Master my track"
6. Wait ~1 minute, the page polls and shows the MP3 download
7. Click "Unlock 24-bit WAV for €7" -> Stripe checkout -> pay
8. Stripe redirects back, WAV download appears

That's the whole loop.

## How to monitor

- Cloudflare Pages -> Deployments + Observability for logs
- Stripe dashboard for payments
- D1: `wrangler d1 execute flotion-mastering --remote --command "SELECT * FROM jobs ORDER BY created_at DESC LIMIT 20"`
- Oracle VPS: `sudo journalctl -u flotion-worker -f`
