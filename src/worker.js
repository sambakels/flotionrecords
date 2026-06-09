// Cloudflare Worker for flotionrecords.com
//
// Two endpoints:
//   POST /api/order           — frontend calls this BEFORE redirecting to
//                                Stripe. Order data is stored in KV with
//                                a TTL of 24h. No Formspree call yet.
//   POST /api/stripe-webhook  — Stripe calls this when a payment completes.
//                                Signature is verified, order data is read
//                                from KV, then a notification is POSTed to
//                                Formspree. No payment, no notification.
//
// Everything else falls through to the static assets bound as ASSETS,
// which is the existing site HTML/CSS/JS.
//
// Required environment variables (set in Cloudflare dashboard):
//   STRIPE_WEBHOOK_SECRET   — Stripe signing secret (whsec_...) — Encrypt
//   FORMSPREE_ENDPOINT      — https://formspree.io/f/xeenlknb (plaintext)
//
// Required bindings:
//   ORDERS  — KV namespace where pending orders are stored

const ALLOWED_TIERS = new Set(['standard', 'express', 'detailed']);
const PRICE_BY_TIER = { standard: 3, express: 6, detailed: 10 };
const NAME_BY_TIER  = { standard: 'Standard', express: 'Express', detailed: 'Detailed' };
const WINDOW_BY_TIER = {
    standard: 'Within 72h',
    express:  'Within 24h',
    detailed: 'Within 24h',
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === '/api/order' && request.method === 'POST') {
            return handleOrder(request, env);
        }
        if (url.pathname === '/api/stripe-webhook' && request.method === 'POST') {
            return handleStripeWebhook(request, env);
        }

        // Reject other methods on these API paths
        if (url.pathname === '/api/order' || url.pathname === '/api/stripe-webhook') {
            return new Response('Method not allowed', { status: 405 });
        }

        // Anything else: fall through to static assets
        return env.ASSETS.fetch(request);
    },
};

// ---------- /api/order ----------------------------------------------------
async function handleOrder(request, env) {
    try {
        const data = await request.json();

        const submission_id = String(data.submission_id || '').trim();
        const tier          = String(data.tier || '').trim();
        const artist        = String(data.artist || '').trim();
        const email         = String(data.email || '').trim();
        const track_link    = String(data.track_link || '').trim();
        const genre         = String(data.genre || '').trim();
        const notes         = String(data.notes || '').trim();

        if (!/^FLOT-[A-Z0-9-]{4,40}$/.test(submission_id)) {
            return json({ error: 'Invalid submission_id' }, 400);
        }
        if (!ALLOWED_TIERS.has(tier)) {
            return json({ error: 'Invalid tier' }, 400);
        }
        if (!artist || artist.length > 120) {
            return json({ error: 'Invalid artist name' }, 400);
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return json({ error: 'Invalid email' }, 400);
        }
        if (!track_link || track_link.length > 1000) {
            return json({ error: 'Invalid track link' }, 400);
        }
        if (!genre || genre.length > 60) {
            return json({ error: 'Invalid genre' }, 400);
        }
        if (notes.length > 2000) {
            return json({ error: 'Notes too long' }, 400);
        }

        const record = {
            submission_id,
            tier,
            tier_name: NAME_BY_TIER[tier],
            price_eur: PRICE_BY_TIER[tier],
            review_window: WINDOW_BY_TIER[tier],
            artist,
            email,
            track_link,
            genre,
            notes,
            submitted_at: new Date().toISOString(),
        };

        // 24h TTL — long enough for any honest payment, short enough that
        // abandoned orders garbage-collect themselves.
        await env.ORDERS.put(submission_id, JSON.stringify(record), {
            expirationTtl: 86400,
        });

        return json({ ok: true });
    } catch (err) {
        return json({ error: 'Bad request' }, 400);
    }
}

// ---------- /api/stripe-webhook -------------------------------------------
async function handleStripeWebhook(request, env) {
    const sigHeader = request.headers.get('stripe-signature');
    if (!sigHeader) return new Response('Missing signature', { status: 400 });

    const rawBody = await request.text();

    const ok = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
    if (!ok) return new Response('Invalid signature', { status: 400 });

    let event;
    try { event = JSON.parse(rawBody); }
    catch (e) { return new Response('Bad JSON', { status: 400 }); }

    // We only care about completed checkout sessions. Other events get
    // acknowledged with 200 so Stripe stops retrying them.
    if (event.type !== 'checkout.session.completed') {
        return new Response('Ignored', { status: 200 });
    }

    const session = event.data?.object;
    if (!session || session.payment_status !== 'paid') {
        return new Response('Not paid', { status: 200 });
    }

    const submission_id = session.client_reference_id;
    if (!submission_id) return new Response('No reference', { status: 200 });

    const stored = await env.ORDERS.get(submission_id);
    if (!stored) {
        // No matching order in KV. Could happen if the customer used
        // a Payment Link directly or the KV entry expired. Send a
        // minimal "we got paid but can't find order details" mail
        // so a real payment is never silently dropped.
        await postToFormspree(env.FORMSPREE_ENDPOINT, {
            _subject: `[Flotion PAID — orphan] ${submission_id}`,
            payment_status: 'PAID',
            submission_id,
            amount_paid_eur: (session.amount_total / 100).toFixed(2),
            customer_email: session.customer_details?.email || '',
            note: 'KV entry missing. Customer paid but order details were not found. Check Stripe dashboard manually.',
        });
        return new Response('OK (orphan)', { status: 200 });
    }

    const order = JSON.parse(stored);

    await postToFormspree(env.FORMSPREE_ENDPOINT, {
        _subject: `[Flotion PAID] ${order.tier_name} submission: ${order.artist}`,
        _replyto: order.email,
        payment_status: 'PAID',
        amount_paid_eur: (session.amount_total / 100).toFixed(2),
        submission_id: order.submission_id,
        tier: order.tier_name,
        price_eur: order.price_eur,
        review_window: order.review_window,
        artist: order.artist,
        email: order.email,
        track_link: order.track_link,
        genre: order.genre,
        notes: order.notes,
        submitted_at: order.submitted_at,
        paid_at: new Date(session.created * 1000).toISOString(),
    });

    // Clean up so the same submission_id can't trigger a second mail
    // if Stripe replays the webhook.
    await env.ORDERS.delete(submission_id);

    return new Response('OK', { status: 200 });
}

// ---------- helpers -------------------------------------------------------
async function postToFormspree(endpoint, fields) {
    if (!endpoint) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        fd.append(k, String(v ?? ''));
    }
    try {
        await fetch(endpoint, {
            method: 'POST',
            body: fd,
            headers: { 'Accept': 'application/json' },
        });
    } catch (e) {
        // Silently swallow — webhook will be retried by Stripe if we
        // return a non-2xx, but for now we'd rather acknowledge and
        // investigate via Stripe dashboard if something dropped.
    }
}

async function verifyStripeSignature(payload, header, secret) {
    if (!secret) return false;
    const parts = header.split(',');
    let timestamp = null;
    const v1 = [];
    for (const part of parts) {
        const [k, ...rest] = part.split('=');
        const v = rest.join('=');
        if (k === 't') timestamp = v;
        else if (k === 'v1') v1.push(v);
    }
    if (!timestamp || !v1.length) return false;

    // 5 minute replay window
    const ageSec = Math.floor(Date.now() / 1000) - Number(timestamp);
    if (!Number.isFinite(ageSec) || ageSec > 300 || ageSec < -300) return false;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const macBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${payload}`));
    const macHex = [...new Uint8Array(macBuf)].map(b => b.toString(16).padStart(2, '0')).join('');

    return v1.some(sig => constantTimeEqual(sig, macHex));
}

function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) {
        r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return r === 0;
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
