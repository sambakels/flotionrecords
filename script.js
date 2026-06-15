/* FLOTION RECORDS - Liquid Glass */

// Anti-spam: any form submitted within 3 seconds of page load is almost
// certainly a bot. Honest humans take longer than 3s to fill out a form.
// Capture-phase listener so this runs before any per-form handler can
// fire off a fetch.
const flotionPageLoaded = Date.now();
document.addEventListener('submit', function (e) {
    if (Date.now() - flotionPageLoaded < 3000) {
        e.preventDefault();
        e.stopPropagation();
    }
}, true);

// Cookie consent banner. Shows on first visit. Decision is stored in
// localStorage and read by the inline gtag script in each page's <head>,
// which uses Google's Consent Mode v2 to keep analytics_storage denied
// until consent is granted.
(function () {
    var key = 'flotion_cookie_consent';
    if (localStorage.getItem(key)) return;
    function build() {
        if (!document.body) { setTimeout(build, 50); return; }
        var b = document.createElement('div');
        b.className = 'cookie-banner';
        b.setAttribute('role', 'dialog');
        b.setAttribute('aria-label', 'Cookie consent');
        b.innerHTML =
            '<div class="cookie-banner-text">We use Google Analytics 4 with IP anonymisation to understand site usage. No advertising or tracking cookies. ' +
            '<a href="/privacy">Read our privacy statement</a>.</div>' +
            '<div class="cookie-banner-buttons">' +
                '<button class="decline" type="button">Decline</button>' +
                '<button class="accept" type="button">Accept</button>' +
            '</div>';
        document.body.appendChild(b);
        b.querySelector('.accept').addEventListener('click', function () {
            localStorage.setItem(key, 'granted');
            if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'granted' });
            b.remove();
        });
        b.querySelector('.decline').addEventListener('click', function () {
            localStorage.setItem(key, 'denied');
            b.remove();
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }
})();

// Dark mode — the initial class is set by an inline pre-render script
// in each page's <head> so we never get a flash-of-light-theme between
// navigations. This handler only owns the toggle click + persistence.
const themeToggle = document.getElementById('themeToggle');

themeToggle.addEventListener('click', e => {
    e.stopPropagation();
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
});

// Nav
const nav = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => { navToggle.classList.toggle('active'); navLinks.classList.toggle('active'); nav.classList.toggle('menu-open'); });
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { navToggle.classList.remove('active'); navLinks.classList.remove('active'); nav.classList.remove('menu-open'); }));

// Apple-style liquid glass hover pill that slides between nav links.
// Only wired on desktop (pointer:fine) — mobile gets the stacked menu so
// the pill would have nothing to slide between. The pill element is
// injected at runtime so the HTML stays unchanged.
if (window.matchMedia('(pointer: fine)').matches) {
    const pill = document.createElement('span');
    pill.className = 'nav-hover-pill';
    navLinks.insertBefore(pill, navLinks.firstChild);

    const moveTo = (link) => {
        // Skip the gradient CTA link — pill behind it would clash with
        // the solid colour. Hide pill instead so the CTA stands alone.
        if (link.classList.contains('nav-cta')) {
            pill.classList.remove('active');
            return;
        }
        const parentRect = navLinks.getBoundingClientRect();
        const linkRect = link.getBoundingClientRect();
        pill.style.left = (linkRect.left - parentRect.left) + 'px';
        pill.style.width = linkRect.width + 'px';
        pill.classList.add('active');
    };

    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('mouseenter', () => moveTo(link));
    });
    navLinks.addEventListener('mouseleave', () => pill.classList.remove('active'));
}

// Glass pill option groups — replaces native <select> elements with
// clickable pill chips. Each .pill-options group has a data-pill-input
// pointing at a hidden input that stores the selected value, so the
// form submits normally as if a <select> had been used. Pill .selected
// state is also cleared when the parent form is reset, so the visual
// matches what the input actually holds.
document.querySelectorAll('.pill-options[data-pill-input]').forEach(group => {
    const inputId = group.dataset.pillInput;
    const input = document.getElementById(inputId);
    if (!input) return;
    const clearAll = () => group.querySelectorAll('.pill-option').forEach(p => p.classList.remove('selected'));
    group.querySelectorAll('.pill-option').forEach(pill => {
        pill.addEventListener('click', () => {
            clearAll();
            pill.classList.add('selected');
            input.value = pill.dataset.value;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });
    const form = input.closest('form');
    if (form) form.addEventListener('reset', () => setTimeout(clearAll, 0));
});

// Blog category filter — clicking a filter pill hides cards that don't
// match the selected category. data-category on each .blog-card matches
// the data-category on the active pill ("all" shows everything).
const blogFilter = document.querySelector('.pill-options[data-blog-filter]');
if (blogFilter) {
    const cards = document.querySelectorAll('.blog-card[data-category]');
    blogFilter.querySelectorAll('.pill-option').forEach(pill => {
        pill.addEventListener('click', () => {
            blogFilter.querySelectorAll('.pill-option').forEach(p => p.classList.remove('selected'));
            pill.classList.add('selected');
            const cat = pill.dataset.category;
            cards.forEach(card => {
                card.style.display = (cat === 'all' || card.dataset.category === cat) ? '' : 'none';
            });
        });
    });
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); const t = document.querySelector(a.getAttribute('href')); if (t) t.scrollIntoView({ behavior: 'smooth' }); });
});

// Reveal
const ro = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }); }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
document.querySelectorAll('.reveal').forEach(e => ro.observe(e));

// Counters
function animCount(el) {
    const t = +el.dataset.target, dur = 2000, s = performance.now();
    (function u(n) {
        const p = Math.min((n - s) / dur, 1);
        el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * t);
        if (p < 1) requestAnimationFrame(u); else el.textContent = t;
    })(s);
}

const so = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) { animCount(e.target); so.unobserve(e.target); } }); }, { threshold: 0.5 });
document.querySelectorAll('.stat-num').forEach(e => so.observe(e));

// Audio
let cTrack = null, cAudio = null, drag = false;
const fmt = s => isNaN(s) || !isFinite(s) ? '0:00' : Math.floor(s/60) + ':' + (Math.floor(s%60)<10?'0':'') + Math.floor(s%60);

document.querySelectorAll('.track').forEach(tr => {
    const btn = tr.querySelector('.tplay'), au = tr.querySelector('audio');
    const bar = tr.querySelector('.pbar'), fill = tr.querySelector('.pfill');
    const tc = tr.querySelector('.tc'), tt = tr.querySelector('.tt');
    // Click/drag handlers attach to .tprog (14px tall wrapper) instead of
    // the 3-4px .pbar so the hit area is comfortable to scrub with. seek()
    // still computes the position relative to the .pbar's bounding rect,
    // so percentages stay accurate.
    const hit = tr.querySelector('.tprog');

    // pendingSeek holds the target percentage when seek can't apply
    // synchronously yet. With preload="metadata" the duration is known on
    // page load, but the actual audio data isn't buffered — and setting
    // currentTime to a position outside the seekable range silently fails
    // in most browsers. The result: user clicks the bar, looks like it
    // worked for a frame, then play starts at 0.
    //
    // The fix: track pendingSeek and apply on whichever ready event fires
    // first that means seeking will actually stick (canplay, seeked, or
    // loadedmetadata with seekable data).
    let pendingSeek = null;

    const tryApplyPending = () => {
        if (pendingSeek === null || !isFinite(au.duration)) return;
        const target = pendingSeek * au.duration;
        // Only apply if the audio has buffered enough to allow a seek to
        // that point. Otherwise the set is silently ignored and we end up
        // back at 0 on play.
        if (au.seekable.length > 0 && au.seekable.end(au.seekable.length - 1) >= target) {
            au.currentTime = target;
            pendingSeek = null;
        }
    };

    btn.addEventListener('click', e => {
        e.stopPropagation();
        if (cAudio === au && !au.paused) { au.pause(); tr.classList.remove('playing'); cTrack = cAudio = null; return; }
        if (cAudio && cAudio !== au) { cAudio.pause(); cAudio.currentTime = 0; if (cTrack) cTrack.classList.remove('playing'); }
        au.play().then(() => {
            tr.classList.add('playing'); cTrack = tr; cAudio = au;
            // Once play() kicks off the actual data load, the canplay /
            // seeked listeners below will apply any pendingSeek that the
            // user queued before hitting play.
        }).catch(() => {});
    });

    au.addEventListener('timeupdate', () => {
        if (drag || pendingSeek !== null) return;
        fill.style.width = (au.currentTime/au.duration*100)+'%';
        tc.textContent = fmt(au.currentTime);
    });
    au.addEventListener('loadedmetadata', () => { tt.textContent = fmt(au.duration); tryApplyPending(); });
    au.addEventListener('durationchange', () => { if (au.duration && isFinite(au.duration)) tt.textContent = fmt(au.duration); });
    // canplay / loadeddata / progress all imply more data is buffered, so the
    // seekable range may now include the user's target.
    au.addEventListener('canplay', tryApplyPending);
    au.addEventListener('loadeddata', tryApplyPending);
    au.addEventListener('progress', tryApplyPending);
    au.addEventListener('ended', () => { tr.classList.remove('playing'); fill.style.width='0%'; tc.textContent='0:00'; cTrack=cAudio=null; });

    function seek(e) {
        const r = bar.getBoundingClientRect(), p = Math.max(0, Math.min((e.clientX-r.left)/r.width, 1));
        fill.style.width = (p*100) + '%';  // immediate visual feedback
        // Always record the user's intent. Even if we apply immediately,
        // having pendingSeek cleared by the seeked event below makes the
        // bookkeeping simpler.
        pendingSeek = p;
        if (!au.duration || !isFinite(au.duration)) {
            // No duration yet — trigger metadata load, pendingSeek will be
            // applied by loadedmetadata (and refined by canplay if needed).
            au.load();
            return;
        }
        const target = p * au.duration;
        if (au.seekable.length > 0 && au.seekable.end(au.seekable.length - 1) >= target) {
            au.currentTime = target;
            pendingSeek = null;
        } else {
            // Data isn't buffered far enough yet. Kick off load (preload
            // metadata only loaded the header bytes) and wait for canplay.
            // Calling au.load() resets currentTime to 0 but timeupdate is
            // gated by pendingSeek so the visual fill stays put.
            try { au.load(); } catch (_) {}
        }
    }

    // When the browser actually completes a seek, clear pendingSeek.
    au.addEventListener('seeked', () => { pendingSeek = null; });

    hit.addEventListener('mousedown', e => { drag=true; seek(e); const m=e=>seek(e), u=()=>{drag=false;document.removeEventListener('mousemove',m);document.removeEventListener('mouseup',u);}; document.addEventListener('mousemove',m); document.addEventListener('mouseup',u); });
    hit.addEventListener('touchstart', e => { drag=true; seek(e.touches[0]); }, {passive:true});
    hit.addEventListener('touchmove', e => { if(drag) seek(e.touches[0]); }, {passive:true});
    hit.addEventListener('touchend', () => { drag=false; });
});

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xeenlknb';

// Demo form: track URL preview (Spotify / SoundCloud / YouTube embed,
// or a simple confirmation pill for other hosts).
const demoLink = document.getElementById('demo-link');
const trackPreview = document.getElementById('trackPreview');

function parseTrackUrl(raw) {
    const url = (raw || '').trim();
    if (!url) return { type: 'empty' };
    let parsed;
    try { parsed = new URL(url); } catch (e) { return { type: 'invalid', url }; }
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'open.spotify.com') {
        const m = parsed.pathname.match(/^\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
        if (m) return { type: 'spotify', kind: m[1], id: m[2], embed: 'https://open.spotify.com/embed/' + m[1] + '/' + m[2], url };
    }
    if (host === 'soundcloud.com' || host === 'm.soundcloud.com') {
        return { type: 'soundcloud', url, embed: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) + '&color=%238b5cf6&inverse_colors=false&auto_play=false&show_user=true&visual=false' };
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
        const id = parsed.searchParams.get('v');
        if (id) return { type: 'youtube', id, embed: 'https://www.youtube.com/embed/' + id, url };
    }
    if (host === 'youtu.be') {
        const id = parsed.pathname.slice(1);
        if (id) return { type: 'youtube', id, embed: 'https://www.youtube.com/embed/' + id, url };
    }
    if (host === 'music.apple.com') return { type: 'apple', label: 'Apple Music', url };
    if (host === 'wetransfer.com' || host === 'we.tl') return { type: 'wetransfer', label: 'WeTransfer', url };
    if (host === 'drive.google.com') return { type: 'drive', label: 'Google Drive', url };
    if (host === 'www.dropbox.com' || host === 'dropbox.com') return { type: 'dropbox', label: 'Dropbox', url };
    if (host === 'tidal.com' || host === 'listen.tidal.com') return { type: 'tidal', label: 'Tidal', url };
    return { type: 'link', label: 'External link', url };
}

function renderPreview(raw) {
    if (!trackPreview) return;
    const p = parseTrackUrl(raw);
    if (p.type === 'empty') { trackPreview.hidden = true; trackPreview.innerHTML = ''; return; }
    trackPreview.hidden = false;

    if (p.type === 'spotify') {
        const h = p.kind === 'track' ? 80 : 152;
        trackPreview.innerHTML = '<iframe src="' + p.embed + '" height="' + h + '" loading="lazy" allow="encrypted-media; autoplay; clipboard-write; fullscreen; picture-in-picture" allowfullscreen></iframe>';
        return;
    }
    if (p.type === 'soundcloud') {
        trackPreview.innerHTML = '<iframe src="' + p.embed + '" height="120" loading="lazy" allow="autoplay"></iframe>';
        return;
    }
    if (p.type === 'youtube') {
        trackPreview.innerHTML = '<iframe src="' + p.embed + '" height="200" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>';
        return;
    }
    if (p.type === 'invalid') {
        trackPreview.innerHTML = '<div class="track-preview-pill error"><svg class="check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>That doesn\'t look like a valid URL.</span></div>';
        return;
    }
    // Known host without embed (Apple, WeTransfer, Drive, Dropbox, Tidal, generic link)
    const label = p.label || 'Link';
    trackPreview.innerHTML = '<div class="track-preview-pill"><svg class="check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><div><div>' + label + ' link received</div><div class="url">' + p.url + '</div></div></div>';
}

if (demoLink) {
    let previewTimer;
    demoLink.addEventListener('input', () => {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => renderPreview(demoLink.value), 350);
    });
    demoLink.addEventListener('blur', () => renderPreview(demoLink.value));
    // Run once in case browser auto-filled the field
    if (demoLink.value) renderPreview(demoLink.value);
}

// Demo form submit -> Formspree, then swap form for in-card success state
const demoForm = document.getElementById('demoForm');
const demoSuccess = document.getElementById('demoSuccess');
const demoSuccessArtist = document.getElementById('demoSuccessArtist');
const demoSuccessEmail = document.getElementById('demoSuccessEmail');
const demoResetBtn = document.getElementById('demoResetBtn');

function showDemoSuccess(artist, email) {
    if (!demoSuccess) return false;
    if (demoSuccessArtist) demoSuccessArtist.textContent = artist || 'there';
    if (demoSuccessEmail) demoSuccessEmail.textContent = email || 'your email';
    demoForm.style.display = 'none';
    demoSuccess.hidden = false;
    demoSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
}

function resetDemoForm() {
    if (!demoForm) return;
    demoForm.reset();
    if (trackPreview) { trackPreview.hidden = true; trackPreview.innerHTML = ''; }
    const b = demoForm.querySelector('.btn');
    if (b) { b.textContent = 'Submit Demo'; b.disabled = false; }
    demoForm.style.display = '';
    if (demoSuccess) demoSuccess.hidden = true;
}

if (demoForm) demoForm.addEventListener('submit', e => {
    e.preventDefault();
    const b = demoForm.querySelector('.btn'), o = b.textContent;
    b.textContent = 'Submitting...';
    b.disabled = true;

    const fd = new FormData(demoForm);
    const artist = (fd.get('artist-name') || '').toString().trim();
    const email = (fd.get('email') || '').toString().trim();
    const track = (fd.get('track-title') || '').toString().trim();
    fd.append('_subject', '[Flotion DEMO] ' + (artist || 'Unknown') + ' / ' + track);
    if (email) fd.append('_replyto', email);

    fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        body: fd,
        headers: { 'Accept': 'application/json' }
    }).then(res => {
        if (res.ok) {
            if (window.gtag) gtag('event', 'demo_submission', {
                track_genre: (fd.get('genre') || 'unknown').toString(),
            });
            if (!showDemoSuccess(artist, email)) {
                b.textContent = 'Demo submitted!';
                demoForm.reset();
                if (trackPreview) { trackPreview.hidden = true; trackPreview.innerHTML = ''; }
                setTimeout(() => { b.textContent = o; b.disabled = false; }, 4000);
            }
        } else {
            b.textContent = 'Error, try again';
            b.disabled = false;
            setTimeout(() => { b.textContent = o; }, 3000);
        }
    }).catch(() => {
        b.textContent = 'Error, try again';
        b.disabled = false;
        setTimeout(() => { b.textContent = o; }, 3000);
    });
});

if (demoResetBtn) demoResetBtn.addEventListener('click', resetDemoForm);

// Mailto fallback for unreleased material the artist can't link publicly
const demoMailto = document.getElementById('demoMailto');
if (demoMailto) demoMailto.addEventListener('click', e => {
    e.preventDefault();
    const v = id => (document.getElementById(id) || {}).value || '';
    const artist = v('demo-name').trim();
    const email = v('demo-email').trim();
    const track = v('demo-track').trim();
    const genre = v('demo-genre').trim();
    const highlight = v('demo-highlight').trim();
    const info = v('demo-info').trim();
    const subject = '[Flotion DEMO] ' + (artist || 'Demo submission') + (track ? ' - ' + track : '');
    const body = [
        'Artist / Producer: ' + (artist || '(please fill in)'),
        'Reply email: ' + (email || '(please fill in)'),
        'Track title: ' + (track || '(please fill in)'),
        'Genre: ' + (genre || '(please fill in)'),
        'Best part: ' + (highlight || '-'),
        '',
        'About the track:',
        info || '(please describe yourself and this track)',
        '',
        '---',
        'Attach your demo file (MP3 or WAV, max 25MB) to this email,',
        'or paste a WeTransfer / Google Drive / Dropbox link below.'
    ].join('\n');
    window.location.href = 'mailto:contact@flotionrecords.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
});

// Contact form via Formspree
const form = document.getElementById('contactForm');
if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    const b = form.querySelector('.btn'), o = b.textContent;
    b.textContent = 'Sending...';
    b.disabled = true;

    const fd = new FormData(form);
    fd.append('_subject', '[Flotion CONTACT] ' + (fd.get('subject') || 'General') + ' - ' + (fd.get('name') || 'Unknown'));
    const replyto = fd.get('email');
    if (replyto) fd.append('_replyto', replyto);

    fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        body: fd,
        headers: { 'Accept': 'application/json' }
    }).then(res => {
        if (res.ok) {
            b.textContent = 'Sent!';
            form.reset();
            setTimeout(() => { b.textContent = o; b.disabled = false; }, 3000);
        } else {
            b.textContent = 'Error, try again';
            b.disabled = false;
            setTimeout(() => { b.textContent = o; }, 3000);
        }
    }).catch(() => {
        b.textContent = 'Error, try again';
        b.disabled = false;
        setTimeout(() => { b.textContent = o; }, 3000);
    });
});