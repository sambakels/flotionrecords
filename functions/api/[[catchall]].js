// Pages Functions catch-all: /api/*
// Routes are dispatched here based on (pathname, method). Logic is the
// same as the previous Workers entry point — it just needs to live under
// functions/ for Cloudflare Pages to actually deploy it.

// Disposable email domains (inlined so we don't depend on import assertions
// or a runtime fetch). Extend as needed.
const disposableEmails = [
    'tempmail.com','10minutemail.com','mailinator.com','guerrillamail.com',
    'throwaway.email','trashmail.com','yopmail.com','getnada.com','tempmailo.com',
    'emailondeck.com','dispostable.com','fakeinbox.com','sharklasers.com',
    'burnermail.io','mintemail.com','mohmal.com','temp-mail.org','tempinbox.com',
    'mailcatch.com','spamgourmet.com','mytemp.email','throwawaymail.com',
    'anonymbox.com','tempr.email','mailnesia.com','jetable.org','instant-mail.de',
    'boun.cr','binkmail.com','12minutemail.com','20minutemail.com','30minutemail.com',
    'minute10mail.com','temporarymail.com','mailtemp.info','trashinbox.com',
    'tempemail.net','filzmail.com','emailtemporanea.net','emailtemporario.com.br',
    'mt2014.com','spam.la','spamday.com','tempemail.biz','tempymail.com',
    'wickmail.net','yopmail.fr','yopmail.net','spambox.us','grr.la',
    'wegwerfmail.org','incognitomail.net','explodemail.com','kasmail.com',
    'mailbiz.biz','tafmail.com','quickinbox.com','spam.su','shitmail.me',
    'spam4.me','mailto.de','trashymail.com','tempmail2.com','tempmaildemo.com',
    'tempmail.io','tempmail.cn','tempmail.net','tempmail.us','mail.tm',
    'disposable.com','disposablemail.com','disposeamail.com','fivedayinbox.com',
    'discardmail.com','discardmail.de','wegwerfemail.de','squizzy.de'
];

const DEFAULT_FORMSPREE = 'https://formspree.io/f/xeenlknb';
const SESSION_DAYS = 30;

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const p = url.pathname;
    const method = request.method;

    try {
        if (p === '/api/order' && method === 'POST') return handleOrder(request, env);
        if (p === '/api/stripe-webhook' && method === 'POST') return handleStripeWebhook(request, env);

        if (p === '/api/account/signup' && method === 'POST') return acctSignup(request, env);
        if (p === '/api/account/verify' && method === 'GET') return acctVerify(request, env);
        if (p === '/api/account/me' && method === 'GET') return acctMe(request, env);
        if (p === '/api/account/signout' && method === 'POST') return acctSignout(request, env);

        if (p === '/api/mastering/upload-init' && method === 'POST') return masteringUploadInit(request, env);
        if (p === '/api/mastering/upload-complete' && method === 'POST') return masteringUploadComplete(request, env);
        if (p.startsWith('/api/mastering/jobs/') && method === 'GET') {
            return masteringJobStatus(request, env, p.split('/').pop());
        }
        if (p.startsWith('/api/mastering/download/') && method === 'GET') {
            return masteringDownload(request, env, p.split('/').pop(), url);
        }
        if (p === '/api/mastering/unlock-wav' && method === 'POST') return masteringUnlockWav(request, env);
        if (p === '/api/mastering/buy-credits' && method === 'POST') return masteringBuyCredits(request, env);
        if (p.startsWith('/api/mastering/upload/') && method === 'PUT') {
            return masteringUploadPut(request, env, p.split('/').pop());
        }

        // ---- studio (anonymous, no sign-in) ----
        if (p === '/api/studio/upload-init' && method === 'POST') return studioUploadInit(request, env);
        if (p.startsWith('/api/studio/upload/') && method === 'PUT') return studioUploadPut(request, env, p.split('/').pop());
        if (p === '/api/studio/upload-complete' && method === 'POST') return studioUploadComplete(request, env);
        if (p.startsWith('/api/studio/jobs/') && method === 'GET') return studioJobStatus(request, env, p.split('/').pop());
        if (p.startsWith('/api/studio/download/') && method === 'GET') return studioDownload(request, env, p.split('/').pop(), url);
        if (p === '/api/studio/buy' && method === 'POST') return studioBuy(request, env);
        if (p === '/api/studio/redeem' && method === 'POST') return studioRedeem(request, env);

        if (p === '/api/worker/poll' && method === 'POST') return workerPoll(request, env);
        if (p === '/api/worker/complete' && method === 'POST') return workerComplete(request, env);
        if (p === '/api/worker/cleanup' && method === 'POST') return workerCleanup(request, env);
        if (p.startsWith('/api/worker/fetch-source/') && method === 'GET') {
            return workerFetchSource(request, env, p.split('/').pop());
        }
        if (p.startsWith('/api/worker/upload-result/') && method === 'PUT') {
            const parts = p.split('/');
            return workerUploadResult(request, env, parts[parts.length - 2], parts[parts.length - 1]);
        }

        return new Response('Method not allowed', { status: 405 });
    } catch (err) {
        return jsonError('Server error: ' + (err.message || 'unknown'), 500);
    }
}

// =============================================================================
// existing /api/order
// =============================================================================

async function handleOrder(request, env) {
    try {
        const formData = await request.formData();
        if (formData.get('_gotcha')) return jsonOk();
        const formspreeRes = await fetch(env.FORMSPREE_ENDPOINT || DEFAULT_FORMSPREE, {
            method: 'POST', body: formData, headers: { 'Accept': 'application/json' },
        });
        if (!formspreeRes.ok) return jsonError('Email failed', 502);
        return jsonOk();
    } catch (e) {
        return jsonError('Bad request', 400);
    }
}

async function handleStripeWebhook(request, env) {
    const sig = request.headers.get('stripe-signature');
    if (!sig) return new Response('Missing signature', { status: 400 });
    const body = await request.text();
    if (!await verifyStripeSignature(body, sig, env.STRIPE_WEBHOOK_SECRET)) {
        return new Response('Invalid signature', { status: 400 });
    }
    let event;
    try { event = JSON.parse(body); } catch (e) { return new Response('Bad JSON', { status: 400 }); }
    if (event.type !== 'checkout.session.completed') return new Response('Ignored', { status: 200 });
    const session = event.data?.object;
    if (!session || session.payment_status !== 'paid') return new Response('Not paid', { status: 200 });

    const meta = session.metadata || {};
    if (meta.purpose === 'mastering_credits' && meta.user_id && meta.credits) {
        const credits = parseInt(meta.credits, 10);
        await env.DB.prepare('UPDATE users SET credits_balance = credits_balance + ? WHERE id = ?')
            .bind(credits, meta.user_id).run();
    } else if (meta.purpose === 'mastering_wav_unlock' && meta.job_id) {
        await env.DB.prepare('UPDATE jobs SET wav_unlocked = 1 WHERE id = ?').bind(meta.job_id).run();
    } else if (meta.purpose === 'studio_single' && meta.job_id) {
        // Unlock the WAV for this single track right away.
        await env.DB.prepare('UPDATE jobs SET wav_unlocked = 1 WHERE id = ?').bind(meta.job_id).run();
    } else if (meta.purpose === 'studio_bundle') {
        // Generate `qty` single-use unlock codes, store them, and email
        // them to the buyer. Codes work on any track, any device, forever.
        const qty = Math.max(1, Math.min(500, parseInt(meta.qty || '0', 10)));
        const email = session.customer_details?.email || meta.email || '';
        const now = new Date().toISOString();
        const codes = [];
        for (let i = 0; i < qty; i++) codes.push(makeRedeemCode());
        // Insert all codes
        for (const c of codes) {
            await env.DB.prepare(
                'INSERT INTO codes (code, used, email, created_at) VALUES (?, 0, ?, ?)'
            ).bind(c, email, now).run();
        }
        // If they bought from a specific track, unlock it now using the
        // first code so they get instant gratification.
        if (meta.job_id && codes.length) {
            await env.DB.prepare('UPDATE codes SET used = 1, used_job_id = ?, used_at = ? WHERE code = ?')
                .bind(meta.job_id, now, codes[0]).run();
            await env.DB.prepare('UPDATE jobs SET wav_unlocked = 1 WHERE id = ?').bind(meta.job_id).run();
        }
        if (email) await sendCodesEmail(env, email, codes, !!meta.job_id);
    } else {
        const submission_id = session.client_reference_id;
        if (submission_id) {
            const stored = await env.ORDERS.get(submission_id);
            if (stored) {
                const order = JSON.parse(stored);
                await postToFormspree(env.FORMSPREE_ENDPOINT || DEFAULT_FORMSPREE, {
                    _subject: `[Flotion PAID] ${order.tier_name || order.tier}: ${order.artist}`,
                    _replyto: order.email,
                    payment_status: 'PAID',
                    amount_paid_eur: (session.amount_total / 100).toFixed(2),
                    ...order,
                });
                await env.ORDERS.delete(submission_id);
            }
        }
    }
    return new Response('OK', { status: 200 });
}

// =============================================================================
// Account
// =============================================================================

async function acctSignup(request, env) {
    const data = await request.json().catch(() => ({}));
    const email = String(data.email || '').trim().toLowerCase();
    const token = String(data.turnstile_token || '');

    if (!isValidEmail(email)) return jsonError('Invalid email', 400);
    if (isDisposableEmail(email)) {
        return jsonError('Please use a non-disposable email address.', 400);
    }
    if (env.TURNSTILE_SECRET && !await verifyTurnstile(token, env.TURNSTILE_SECRET, request)) {
        return jsonError('Verification challenge failed. Please try again.', 400);
    }

    let user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first();
    if (!user) {
        const id = randomId('usr');
        await env.DB.prepare(
            'INSERT INTO users (id, email, email_verified, free_used, credits_balance, created_at) VALUES (?, ?, 0, 0, 0, ?)'
        ).bind(id, email, new Date().toISOString()).run();
        user = { id, email };
    }

    const vtok = randomId('vt') + randomId('').slice(0, 12);
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await env.DB.prepare(
        'INSERT INTO verify_tokens (token, user_id, purpose, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    ).bind(vtok, user.id, 'signin', expires, new Date().toISOString()).run();

    // Send to /signin (HTML confirm page) instead of /api/account/verify
    // directly. Gmail and similar pre-fetch links in incoming mail for
    // security scanning; a direct verify URL would be "used" before the
    // real human can click it.
    const verifyUrl = `${env.SITE_URL || 'https://flotionrecords.com'}/signin?token=${encodeURIComponent(vtok)}`;
    await sendMagicLinkEmail(env, email, verifyUrl);

    return jsonOk({ sent: true });
}

async function acctVerify(request, env) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!token) return new Response('Missing token', { status: 400 });

    const row = await env.DB.prepare(
        'SELECT token, user_id, expires_at, used FROM verify_tokens WHERE token = ?'
    ).bind(token).first();
    if (!row) return redirectTo('/account?error=invalid');
    if (row.used) return redirectTo('/account?error=used');
    if (new Date(row.expires_at).getTime() < Date.now()) return redirectTo('/account?error=expired');

    await env.DB.prepare('UPDATE verify_tokens SET used = 1 WHERE token = ?').bind(token).run();
    await env.DB.prepare(
        'UPDATE users SET email_verified = 1, last_login_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), row.user_id).run();

    const sessionId = randomId('sess') + randomId('').slice(0, 16);
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    await env.DB.prepare(
        'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
    ).bind(sessionId, row.user_id, expires, new Date().toISOString()).run();

    const cookie = await signSessionCookie(sessionId, env.SESSION_SECRET);
    const headers = new Headers();
    headers.set('Location', '/mastering');
    headers.set('Set-Cookie', `flotion_sess=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
    return new Response(null, { status: 302, headers });
}

async function acctMe(request, env) {
    const user = await currentUser(request, env);
    if (!user) return jsonError('Not signed in', 401);
    return jsonOk({
        signed_in: true,
        email: user.email,
        free_used: !!user.free_used,
        credits_balance: user.credits_balance,
    });
}

async function acctSignout(request, env) {
    const sessionId = await sessionIdFromRequest(request, env.SESSION_SECRET);
    if (sessionId) {
        await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    }
    const headers = new Headers();
    headers.set('Set-Cookie', 'flotion_sess=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

async function currentUser(request, env) {
    const sessionId = await sessionIdFromRequest(request, env.SESSION_SECRET);
    if (!sessionId) return null;
    const sess = await env.DB.prepare(
        'SELECT s.user_id, s.expires_at, u.email, u.free_used, u.credits_balance FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?'
    ).bind(sessionId).first();
    if (!sess) return null;
    if (new Date(sess.expires_at).getTime() < Date.now()) return null;
    return { id: sess.user_id, email: sess.email, free_used: sess.free_used, credits_balance: sess.credits_balance };
}

// =============================================================================
// Mastering
// =============================================================================

const ALLOWED_GENRES = new Set([
    'auto', 'ibiza_house', 'uk_garage', 'edm_bigroom', 'hardstyle', 'deep_house',
    'techno_peaktime', 'drum_and_bass', 'lofi_hiphop', 'pop', 'rock_indie',
    'solo_piano', 'ambient_cinematic',
]);
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

async function masteringUploadInit(request, env) {
    const user = await currentUser(request, env);
    if (!user) return jsonError('Not signed in', 401);

    const data = await request.json().catch(() => ({}));
    const filename = String(data.filename || '').slice(0, 200);
    const size = parseInt(data.size || 0, 10);
    const genre = String(data.genre || 'auto');

    if (!filename) return jsonError('Filename required', 400);
    if (size <= 0 || size > MAX_UPLOAD_SIZE) return jsonError('File too large (max 50 MB)', 400);
    if (!ALLOWED_GENRES.has(genre)) return jsonError('Invalid genre', 400);

    // Unlimited free MP3 previews after signup. Paid credits unlock the
    // WAV master automatically at upload time; without credits the user
    // still gets the MP3 result and can later pay €7 to unlock that
    // specific job's WAV.
    const tier = user.credits_balance > 0 ? 'paid' : 'free';
    const jobId = randomId('job');
    const sourceKey = `uploads/${user.id}/${jobId}/${safeFilename(filename)}`;

    await env.DB.prepare(
        'INSERT INTO jobs (id, user_id, tier, genre, source_filename, source_r2_key, status, wav_unlocked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(jobId, user.id, tier, genre, filename, sourceKey, 'awaiting_upload', tier === 'paid' ? 1 : 0, new Date().toISOString()).run();

    return jsonOk({ job_id: jobId, upload_url: `/api/mastering/upload/${jobId}` });
}

async function masteringUploadPut(request, env, jobId) {
    const user = await currentUser(request, env);
    if (!user) return jsonError('Not signed in', 401);
    const job = await env.DB.prepare('SELECT id, user_id, source_r2_key, status FROM jobs WHERE id = ?')
        .bind(jobId).first();
    if (!job || job.user_id !== user.id) return jsonError('Job not found', 404);
    if (job.status !== 'awaiting_upload') return jsonError('Job in wrong state', 409);

    await env.AUDIO.put(job.source_r2_key, request.body, {
        httpMetadata: { contentType: request.headers.get('content-type') || 'audio/wav' },
    });
    return jsonOk({ uploaded: true });
}

async function masteringUploadComplete(request, env) {
    const user = await currentUser(request, env);
    if (!user) return jsonError('Not signed in', 401);
    const data = await request.json().catch(() => ({}));
    const jobId = String(data.job_id || '');
    const job = await env.DB.prepare('SELECT id, user_id, tier, status FROM jobs WHERE id = ?')
        .bind(jobId).first();
    if (!job || job.user_id !== user.id) return jsonError('Job not found', 404);
    if (job.status !== 'awaiting_upload') return jsonError('Job in wrong state', 409);

    // Only paid uploads consume a credit. Free MP3 previews are unlimited.
    if (job.tier === 'paid') {
        await env.DB.prepare('UPDATE users SET credits_balance = MAX(0, credits_balance - 1) WHERE id = ?')
            .bind(user.id).run();
    }
    await env.DB.prepare('UPDATE jobs SET status = ? WHERE id = ?').bind('pending', jobId).run();
    return jsonOk({ enqueued: true });
}

async function masteringJobStatus(request, env, jobId) {
    const user = await currentUser(request, env);
    if (!user) return jsonError('Not signed in', 401);
    const job = await env.DB.prepare(
        'SELECT id, status, tier, genre, wav_unlocked, source_filename, error_message, report_json FROM jobs WHERE id = ? AND user_id = ?'
    ).bind(jobId, user.id).first();
    if (!job) return jsonError('Not found', 404);
    let report = null;
    try { report = job.report_json ? JSON.parse(job.report_json) : null; } catch (e) {}
    return jsonOk({
        id: job.id, status: job.status, tier: job.tier, genre: job.genre,
        wav_unlocked: !!job.wav_unlocked, source_filename: job.source_filename,
        error_message: job.error_message, report,
    });
}

async function masteringDownload(request, env, jobId, url) {
    const user = await currentUser(request, env);
    if (!user) return jsonError('Not signed in', 401);
    const kind = url.searchParams.get('kind') || 'mp3';
    if (!['mp3', 'wav', 'source-mp3'].includes(kind)) return jsonError('Invalid kind', 400);
    const job = await env.DB.prepare(
        'SELECT id, user_id, status, wav_unlocked, result_mp3_key, result_wav_key, result_source_mp3_key, source_filename FROM jobs WHERE id = ?'
    ).bind(jobId).first();
    if (!job || job.user_id !== user.id) return jsonError('Not found', 404);
    if (job.status !== 'done') return jsonError('Not ready', 409);
    if (kind === 'wav' && !job.wav_unlocked) return jsonError('WAV not unlocked', 402);
    let key;
    if (kind === 'wav') key = job.result_wav_key;
    else if (kind === 'source-mp3') key = job.result_source_mp3_key;
    else key = job.result_mp3_key;
    if (!key) return jsonError('File missing', 404);
    const obj = await env.AUDIO.get(key);
    if (!obj) return jsonError('File missing', 404);
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('Content-Disposition', `attachment; filename="${stripExt(job.source_filename)}_mastered.${kind}"`);
    return new Response(obj.body, { headers });
}

async function masteringUnlockWav(request, env) {
    const user = await currentUser(request, env);
    if (!user) return jsonError('Not signed in', 401);
    const data = await request.json().catch(() => ({}));
    const jobId = String(data.job_id || '');
    const job = await env.DB.prepare('SELECT id, user_id, status, wav_unlocked FROM jobs WHERE id = ?')
        .bind(jobId).first();
    if (!job || job.user_id !== user.id) return jsonError('Not found', 404);
    if (job.wav_unlocked) return jsonOk({ url: '/mastering' });
    if (job.status !== 'done') return jsonError('Job not done', 409);

    const url = await createStripeCheckout(env, {
        price: env.STRIPE_PRICE_WAV_UNLOCK,
        customer_email: user.email,
        metadata: { purpose: 'mastering_wav_unlock', user_id: user.id, job_id: jobId },
        success_url: `${env.SITE_URL}/mastering?completed=${jobId}`,
        cancel_url: `${env.SITE_URL}/mastering`,
    });
    return jsonOk({ url });
}

async function masteringBuyCredits(request, env) {
    const user = await currentUser(request, env);
    if (!user) return jsonError('Not signed in', 401);
    const data = await request.json().catch(() => ({}));
    const tier = String(data.tier || '');
    let price, credits;
    if (tier === 'single') { price = env.STRIPE_PRICE_SINGLE; credits = 1; }
    else if (tier === 'pack') { price = env.STRIPE_PRICE_PACK; credits = 5; }
    else return jsonError('Invalid tier', 400);

    const url = await createStripeCheckout(env, {
        price, customer_email: user.email,
        metadata: { purpose: 'mastering_credits', user_id: user.id, credits: String(credits) },
        success_url: `${env.SITE_URL}/mastering?credits=${credits}`,
        cancel_url: `${env.SITE_URL}/services#mastering`,
    });
    return jsonOk({ url });
}

// =============================================================================
// Oracle worker queue API
// =============================================================================

function workerAuthOk(request, env) {
    const auth = request.headers.get('authorization') || '';
    if (!env.WORKER_SHARED_SECRET) return false;
    return auth === `Bearer ${env.WORKER_SHARED_SECRET}`;
}

async function workerPoll(request, env) {
    if (!workerAuthOk(request, env)) return new Response('Unauthorized', { status: 401 });
    const job = await env.DB.prepare(
        "SELECT id, user_id, genre, source_r2_key, source_filename, tier FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
    ).first();
    if (!job) return jsonOk({ job: null });
    await env.DB.prepare("UPDATE jobs SET status = 'processing', started_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), job.id).run();
    return jsonOk({ job });
}

async function workerFetchSource(request, env, jobId) {
    if (!workerAuthOk(request, env)) return new Response('Unauthorized', { status: 401 });
    const job = await env.DB.prepare('SELECT source_r2_key FROM jobs WHERE id = ?').bind(jobId).first();
    if (!job) return new Response('Not found', { status: 404 });
    const obj = await env.AUDIO.get(job.source_r2_key);
    if (!obj) return new Response('Source missing', { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    return new Response(obj.body, { headers });
}

async function workerUploadResult(request, env, jobId, kind) {
    if (!workerAuthOk(request, env)) return new Response('Unauthorized', { status: 401 });
    const knownKinds = { mp3: 'audio/mpeg', wav: 'audio/wav', 'source-mp3': 'audio/mpeg' };
    if (!(kind in knownKinds)) return new Response('Invalid kind', { status: 400 });

    const filename = kind === 'source-mp3' ? 'source.mp3' : `master.${kind}`;
    const key = `results/${jobId}/${filename}`;
    await env.AUDIO.put(key, request.body, {
        httpMetadata: { contentType: knownKinds[kind] },
    });

    let col;
    if (kind === 'mp3') col = 'result_mp3_key';
    else if (kind === 'wav') col = 'result_wav_key';
    else col = 'result_source_mp3_key';

    await env.DB.prepare(`UPDATE jobs SET ${col} = ? WHERE id = ?`).bind(key, jobId).run();
    return jsonOk({ stored: key });
}

async function workerComplete(request, env) {
    if (!workerAuthOk(request, env)) return new Response('Unauthorized', { status: 401 });
    const data = await request.json().catch(() => ({}));
    const jobId = String(data.job_id || '');
    const ok = !!data.ok;
    const report = data.report || null;
    const error = data.error_message || null;
    if (!jobId) return jsonError('Missing job_id', 400);

    if (ok) {
        await env.DB.prepare(
            "UPDATE jobs SET status = 'done', finished_at = ?, report_json = ? WHERE id = ?"
        ).bind(new Date().toISOString(), report ? JSON.stringify(report) : null, jobId).run();
    } else {
        await env.DB.prepare(
            "UPDATE jobs SET status = 'failed', finished_at = ?, error_message = ? WHERE id = ?"
        ).bind(new Date().toISOString(), error, jobId).run();
    }

    const row = await env.DB.prepare(
        'SELECT u.email, j.source_filename FROM jobs j JOIN users u ON u.id = j.user_id WHERE j.id = ?'
    ).bind(jobId).first();
    if (row && ok) await sendResultEmail(env, row.email, row.source_filename, jobId);

    // Delete the original uploaded source from R2 the moment we are done
    // with it. It is never served to the browser (the A/B player uses the
    // separately generated source-mp3 preview), so it is safe to remove
    // immediately. This is the single biggest file per job.
    const srcRow = await env.DB.prepare('SELECT source_r2_key FROM jobs WHERE id = ?').bind(jobId).first();
    if (srcRow?.source_r2_key) {
        try { await env.AUDIO.delete(srcRow.source_r2_key); } catch (e) {}
    }

    return jsonOk();
}

// Periodic cleanup: free, unpaid jobs older than 48h are fully removed
// (R2 objects + DB row). Paid jobs (wav_unlocked = 1) are kept. Called by
// the worker about once an hour, batched to stay fast.
async function workerCleanup(request, env) {
    if (!workerAuthOk(request, env)) return new Response('Unauthorized', { status: 401 });
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const rows = await env.DB.prepare(
        'SELECT id, source_r2_key, result_mp3_key, result_wav_key, result_source_mp3_key ' +
        'FROM jobs WHERE wav_unlocked = 0 AND created_at < ? LIMIT 200'
    ).bind(cutoff).all();
    let deleted = 0;
    for (const j of (rows.results || [])) {
        for (const k of [j.source_r2_key, j.result_mp3_key, j.result_wav_key, j.result_source_mp3_key]) {
            if (k) { try { await env.AUDIO.delete(k); } catch (e) {} }
        }
        await env.DB.prepare('DELETE FROM jobs WHERE id = ?').bind(j.id).run();
        deleted++;
    }
    return jsonOk({ deleted });
}

// =============================================================================
// Studio (anonymous, no sign-in)
// =============================================================================

const STUDIO_GENRES = new Set([
    'auto', 'ibiza_house', 'uk_garage', 'edm_bigroom', 'hardstyle', 'deep_house',
    'techno_peaktime', 'drum_and_bass', 'lofi_hiphop', 'pop', 'rock_indie',
    'solo_piano', 'ambient_cinematic',
]);
const STUDIO_MAX_SIZE = 60 * 1024 * 1024;
const STUDIO_AUDIO_EXT = /\.(wav|mp3|flac|m4a|aif|aiff|ogg|opus|aac|wma)$/i;

function getCookie(request, name) {
    const raw = request.headers.get('cookie') || '';
    const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : null;
}

// Returns { id, setCookie }. setCookie is non-null only when a new anon id
// was minted and must be attached to the response.
function anonIdentity(request) {
    let id = getCookie(request, 'flotion_anon');
    let setCookie = null;
    if (!id || !/^anon_[a-f0-9]{24}$/.test(id)) {
        id = randomId('anon');
        setCookie = `flotion_anon=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${365 * 86400}`;
    }
    return { id, setCookie };
}

function withCookie(resp, setCookie) {
    if (!setCookie) return resp;
    const headers = new Headers(resp.headers);
    headers.append('Set-Cookie', setCookie);
    return new Response(resp.body, { status: resp.status, headers });
}

async function studioUploadInit(request, env) {
    const { id: anon, setCookie } = anonIdentity(request);
    const data = await request.json().catch(() => ({}));
    const filename = String(data.filename || '').slice(0, 200);
    const size = parseInt(data.size || 0, 10);
    const genre = String(data.genre || 'auto');
    const token = String(data.turnstile_token || '');

    if (!STUDIO_AUDIO_EXT.test(filename)) return withCookie(jsonError('Please upload an audio file (WAV, FLAC, MP3, M4A and more).', 400), setCookie);
    if (size <= 0 || size > STUDIO_MAX_SIZE) return withCookie(jsonError('File too large (max 60 MB).', 400), setCookie);
    if (!STUDIO_GENRES.has(genre)) return withCookie(jsonError('Invalid genre', 400), setCookie);
    if (env.TURNSTILE_SECRET && !await verifyTurnstile(token, env.TURNSTILE_SECRET, request)) {
        return withCookie(jsonError('Verification failed. Please try again.', 400), setCookie);
    }

    // Rate limit: max 12 jobs per anon per rolling hour.
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const recent = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND created_at > ?'
    ).bind(anon, since).first();
    if (recent && recent.n >= 12) {
        return withCookie(jsonError('Too many uploads in the last hour. Please try again later.', 429), setCookie);
    }

    const jobId = randomId('job');
    const sourceKey = `studio/${anon}/${jobId}/${safeFilename(filename)}`;
    await env.DB.prepare(
        'INSERT INTO jobs (id, user_id, tier, genre, source_filename, source_r2_key, status, wav_unlocked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'
    ).bind(jobId, anon, 'studio', genre, filename, sourceKey, 'awaiting_upload', new Date().toISOString()).run();

    return withCookie(jsonOk({ job_id: jobId, upload_url: `/api/studio/upload/${jobId}` }), setCookie);
}

async function studioUploadPut(request, env, jobId) {
    const { id: anon } = anonIdentity(request);
    const job = await env.DB.prepare('SELECT id, user_id, source_r2_key, status FROM jobs WHERE id = ?').bind(jobId).first();
    if (!job || job.user_id !== anon) return jsonError('Job not found', 404);
    if (job.status !== 'awaiting_upload') return jsonError('Job in wrong state', 409);
    await env.AUDIO.put(job.source_r2_key, request.body, {
        httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' },
    });
    return jsonOk({ uploaded: true });
}

async function studioUploadComplete(request, env) {
    const { id: anon } = anonIdentity(request);
    const data = await request.json().catch(() => ({}));
    const jobId = String(data.job_id || '');
    const job = await env.DB.prepare('SELECT id, user_id, status FROM jobs WHERE id = ?').bind(jobId).first();
    if (!job || job.user_id !== anon) return jsonError('Job not found', 404);
    if (job.status !== 'awaiting_upload') return jsonError('Job in wrong state', 409);
    await env.DB.prepare('UPDATE jobs SET status = ? WHERE id = ?').bind('pending', jobId).run();
    return jsonOk({ enqueued: true });
}

async function studioJobStatus(request, env, jobId) {
    const { id: anon } = anonIdentity(request);
    const job = await env.DB.prepare(
        'SELECT id, status, genre, wav_unlocked, source_filename, error_message, report_json, user_id FROM jobs WHERE id = ?'
    ).bind(jobId).first();
    if (!job || job.user_id !== anon) return jsonError('Not found', 404);
    let report = null;
    try { report = job.report_json ? JSON.parse(job.report_json) : null; } catch (e) {}
    return jsonOk({
        id: job.id, status: job.status, genre: job.genre,
        wav_unlocked: !!job.wav_unlocked, source_filename: job.source_filename,
        error_message: job.error_message, report,
    });
}

async function studioDownload(request, env, jobId, url) {
    const { id: anon } = anonIdentity(request);
    const kind = url.searchParams.get('kind') || 'master-mp3';
    const map = {
        'source-mp3': 'result_source_mp3_key',
        'master-mp3': 'result_mp3_key',
        'master-wav': 'result_wav_key',
    };
    if (!(kind in map)) return jsonError('Invalid kind', 400);

    const job = await env.DB.prepare(
        'SELECT id, user_id, status, wav_unlocked, result_source_mp3_key, result_mp3_key, result_wav_key, source_filename FROM jobs WHERE id = ?'
    ).bind(jobId).first();
    if (!job || job.user_id !== anon) return jsonError('Not found', 404);
    if (job.status !== 'done') return jsonError('Not ready', 409);

    // The WAV is the paid product. Free for streaming are the two MP3s.
    // The WAV unlocks via a single purchase or a redeemed code (both set
    // wav_unlocked = 1); we just check the flag here.
    if (kind === 'master-wav' && !job.wav_unlocked) {
        return jsonError('WAV not unlocked', 402);
    }

    const key = job[map[kind]];
    if (!key) return jsonError('File missing', 404);
    const obj = await env.AUDIO.get(key);
    if (!obj) return jsonError('File missing', 404);

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    if (kind === 'master-wav') {
        headers.set('Content-Disposition', `attachment; filename="${stripExt(job.source_filename)}_mastered.wav"`);
    }
    return new Response(obj.body, { headers });
}

// Pricing (in euro cents). Single WAV = 7.00. Bundle = 40.00 for the
// first 10 tracks, +2.00 for every track beyond 10.
const STUDIO_SINGLE_CENTS = 700;
function bundleCents(qty) {
    const q = Math.max(10, Math.min(500, qty | 0));
    return 4000 + Math.max(0, q - 10) * 200;
}

async function studioBuy(request, env) {
    const { id: anon, setCookie } = anonIdentity(request);
    const data = await request.json().catch(() => ({}));
    const kind = String(data.kind || '');
    const jobId = String(data.job_id || '');

    const job = await env.DB.prepare('SELECT id, user_id, status FROM jobs WHERE id = ?').bind(jobId).first();
    if (!job || job.user_id !== anon) return withCookie(jsonError('Job not found', 404), setCookie);
    if (job.status !== 'done') return withCookie(jsonError('Job not ready', 409), setCookie);

    let amount, productName, metadata;
    if (kind === 'single') {
        amount = STUDIO_SINGLE_CENTS;
        productName = 'Flotion mix & master, 1 WAV download';
        metadata = { purpose: 'studio_single', anon_id: anon, job_id: jobId };
    } else if (kind === 'bundle') {
        const qty = Math.max(10, Math.min(500, parseInt(data.qty || '10', 10)));
        amount = bundleCents(qty);
        productName = `Flotion mix & master bundle, ${qty} WAV downloads`;
        metadata = { purpose: 'studio_bundle', anon_id: anon, job_id: jobId, qty: String(qty) };
    } else {
        return withCookie(jsonError('Invalid kind', 400), setCookie);
    }

    const checkoutUrl = await createStripeCheckout(env, {
        amount_cents: amount,
        product_name: productName,
        metadata,
        success_url: `${env.SITE_URL}/studio?paid=${jobId}`,
        cancel_url: `${env.SITE_URL}/studio?paid=${jobId}`,
    });
    return withCookie(jsonOk({ url: checkoutUrl }), setCookie);
}

async function studioRedeem(request, env) {
    const { id: anon, setCookie } = anonIdentity(request);
    const data = await request.json().catch(() => ({}));
    const code = String(data.code || '').trim().toUpperCase().replace(/\s+/g, '');
    const jobId = String(data.job_id || '');

    if (!/^FLO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
        return withCookie(jsonError('That code does not look right.', 400), setCookie);
    }
    const job = await env.DB.prepare('SELECT id, user_id, status, wav_unlocked FROM jobs WHERE id = ?').bind(jobId).first();
    if (!job || job.user_id !== anon) return withCookie(jsonError('Track not found', 404), setCookie);
    if (job.status !== 'done') return withCookie(jsonError('Track not ready', 409), setCookie);
    if (job.wav_unlocked) return withCookie(jsonOk({ unlocked: true }), setCookie);

    const row = await env.DB.prepare('SELECT code, used FROM codes WHERE code = ?').bind(code).first();
    if (!row) return withCookie(jsonError('Unknown code.', 404), setCookie);
    if (row.used) return withCookie(jsonError('That code has already been used.', 409), setCookie);

    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE codes SET used = 1, used_job_id = ?, used_at = ? WHERE code = ?')
        .bind(jobId, now, code).run();
    await env.DB.prepare('UPDATE jobs SET wav_unlocked = 1 WHERE id = ?').bind(jobId).run();
    return withCookie(jsonOk({ unlocked: true }), setCookie);
}

// =============================================================================
// helpers
// =============================================================================

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isDisposableEmail(email) {
    const domain = (email.split('@')[1] || '').toLowerCase();
    return Array.isArray(disposableEmails) && disposableEmails.some(d => domain === d || domain.endsWith('.' + d));
}

async function verifyTurnstile(token, secret, request) {
    if (!token) return false;
    const ip = request.headers.get('cf-connecting-ip') || '';
    const fd = new FormData();
    fd.append('secret', secret);
    fd.append('response', token);
    if (ip) fd.append('remoteip', ip);
    try {
        const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd });
        const j = await r.json();
        return !!j.success;
    } catch (e) {
        return false;
    }
}

async function sendMagicLinkEmail(env, email, verifyUrl) {
    if (!env.RESEND_API_KEY) { console.log('RESEND_API_KEY not set, would email', email); return; }
    const html = `
<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#1a1a2e">
  <h2 style="margin:0 0 16px">Sign in to Flotion Records</h2>
  <p style="margin:0 0 18px;line-height:1.55;color:#444">Click the button below to finish signing in. The link expires in 15 minutes.</p>
  <p style="margin:0 0 24px"><a href="${verifyUrl}" style="display:inline-block;padding:12px 22px;background:linear-gradient(135deg,#1d4ed8,#6d28d9,#a21caf);color:#fff;text-decoration:none;border-radius:100px;font-weight:700">Sign in to Flotion</a></p>
  <p style="margin:0;font-size:13px;color:#888;line-height:1.5">If the button does not work, copy and paste this URL into your browser:<br><span style="word-break:break-all">${verifyUrl}</span></p>
</div>`;
    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: env.RESEND_FROM || 'Flotion Records <hello@flotionrecords.com>',
            to: [email], subject: 'Your Flotion sign-in link', html,
        }),
    });
}

async function sendResultEmail(env, email, sourceFilename, jobId) {
    if (!env.RESEND_API_KEY) return;
    const url = `${env.SITE_URL || 'https://flotionrecords.com'}/mastering?completed=${jobId}`;
    const html = `
<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#1a1a2e">
  <h2 style="margin:0 0 16px">Your master is ready</h2>
  <p style="margin:0 0 22px;line-height:1.55;color:#444">${stripExt(sourceFilename)} is mastered and ready to download.</p>
  <p style="margin:0 0 16px"><a href="${url}" style="display:inline-block;padding:12px 22px;background:linear-gradient(135deg,#1d4ed8,#6d28d9,#a21caf);color:#fff;text-decoration:none;border-radius:100px;font-weight:700">Open your master</a></p>
</div>`;
    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: env.RESEND_FROM || 'Flotion Records <hello@flotionrecords.com>',
            to: [email], subject: `Your master of ${stripExt(sourceFilename)} is ready`, html,
        }),
    });
}

// Unambiguous charset (no 0/O/1/I) so codes are easy to read and type.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRedeemCode() {
    const pick = (n) => {
        const arr = new Uint8Array(n);
        crypto.getRandomValues(arr);
        return [...arr].map(b => CODE_CHARS[b % CODE_CHARS.length]).join('');
    };
    return `FLO-${pick(4)}-${pick(4)}`;
}

async function sendCodesEmail(env, email, codes, firstAlreadyUsed) {
    if (!env.RESEND_API_KEY) { console.log('No RESEND_API_KEY, codes for', email, codes.join(',')); return; }
    const rows = codes.map((c, i) => {
        const used = (firstAlreadyUsed && i === 0);
        return `<tr><td style="padding:8px 12px;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:1px;border-bottom:1px solid #eee;${used ? 'color:#aaa;text-decoration:line-through' : 'color:#1a1a2e'}">${c}${used ? '  (used on your first track)' : ''}</td></tr>`;
    }).join('');
    const html = `
<div style="font-family:Inter,sans-serif;max-width:540px;margin:0 auto;padding:20px;color:#1a1a2e">
  <h2 style="margin:0 0 12px">Your mix &amp; master download codes</h2>
  <p style="margin:0 0 18px;line-height:1.55;color:#444">Thanks for your purchase. Each code unlocks one lossless 24-bit WAV download in the Flotion studio. Codes never expire. Enter a code on the result screen after you master a track.</p>
  <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:10px;overflow:hidden">${rows}</table>
  <p style="margin:18px 0 0"><a href="${env.SITE_URL || 'https://flotionrecords.com'}/studio" style="display:inline-block;padding:12px 22px;background:linear-gradient(135deg,#1d4ed8,#6d28d9,#a21caf);color:#fff;text-decoration:none;border-radius:100px;font-weight:700">Open the studio</a></p>
  <p style="margin:16px 0 0;font-size:12px;color:#999">Keep this email. Anyone with a code can redeem it, so don't share them.</p>
</div>`;
    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: env.RESEND_FROM || 'Flotion Records <hello@flotionrecords.com>',
            to: [email], subject: `Your ${codes.length} Flotion download code${codes.length === 1 ? '' : 's'}`, html,
        }),
    });
}

async function createStripeCheckout(env, opts) {
    const fd = new URLSearchParams();
    fd.append('mode', 'payment');
    if (opts.amount_cents) {
        // Inline price_data: no pre-made Stripe Price ID needed, so the
        // amount can vary (bundle quantity) and the only required secret
        // is STRIPE_SECRET_KEY.
        fd.append('line_items[0][price_data][currency]', 'eur');
        fd.append('line_items[0][price_data][unit_amount]', String(opts.amount_cents));
        fd.append('line_items[0][price_data][product_data][name]', opts.product_name || 'Flotion mix & master');
        fd.append('line_items[0][quantity]', '1');
    } else {
        fd.append('line_items[0][price]', opts.price);
        fd.append('line_items[0][quantity]', '1');
    }
    fd.append('success_url', opts.success_url);
    fd.append('cancel_url', opts.cancel_url);
    if (opts.customer_email) fd.append('customer_email', opts.customer_email);
    for (const [k, v] of Object.entries(opts.metadata || {})) fd.append(`metadata[${k}]`, v);
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: fd,
    });
    const j = await r.json();
    if (!r.ok || !j.url) throw new Error(j.error?.message || 'Stripe checkout failed');
    return j.url;
}

async function postToFormspree(endpoint, fields) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v ?? ''));
    try { await fetch(endpoint, { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } }); }
    catch (e) {}
}

// ----- crypto helpers -----

function randomId(prefix = '') {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    const hex = [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
    return prefix ? `${prefix}_${hex}` : hex;
}

async function signSessionCookie(sessionId, secret) {
    const sig = await hmacHex(sessionId, secret || 'fallback');
    return `${sessionId}.${sig}`;
}

async function sessionIdFromRequest(request, secret) {
    const raw = request.headers.get('cookie') || '';
    const m = raw.match(/(?:^|;\s*)flotion_sess=([^;]+)/);
    if (!m) return null;
    const cookie = decodeURIComponent(m[1]);
    const [sessionId, sig] = cookie.split('.');
    if (!sessionId || !sig) return null;
    const expected = await hmacHex(sessionId, secret || 'fallback');
    if (!constantTimeEqual(sig, expected)) return null;
    return sessionId;
}

async function hmacHex(message, secret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyStripeSignature(payload, header, secret) {
    if (!secret) return false;
    const parts = header.split(',');
    let timestamp = null;
    const v1 = [];
    for (const p of parts) {
        const [k, ...rest] = p.split('=');
        const v = rest.join('=');
        if (k === 't') timestamp = v;
        else if (k === 'v1') v1.push(v);
    }
    if (!timestamp || !v1.length) return false;
    const ageSec = Math.floor(Date.now() / 1000) - Number(timestamp);
    if (!Number.isFinite(ageSec) || ageSec > 300 || ageSec < -300) return false;
    const macHex = await hmacHex(`${timestamp}.${payload}`, secret);
    return v1.some(s => constantTimeEqual(s, macHex));
}

function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
}

function safeFilename(name) { return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100); }
function stripExt(name) { return String(name).replace(/\.[^.]+$/, ''); }

function jsonOk(obj = { ok: true }) {
    return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function jsonError(message, status = 400) {
    return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } });
}
function redirectTo(path) {
    return new Response(null, { status: 302, headers: { 'Location': path } });
}
