/* FLOTION RECORDS — Liquid Glass */

// Ripple
document.addEventListener('click', e => {
    const c = document.getElementById('rippleContainer');
    for (let i = 0; i < 2; i++) {
        const r = document.createElement('div');
        r.className = 'ripple';
        r.style.left = e.clientX + 'px';
        r.style.top = e.clientY + 'px';
        r.style.animationDelay = (i * 0.1) + 's';
        c.appendChild(r);
        setTimeout(() => r.remove(), 900);
    }
});

// Dark mode
const themeToggle = document.getElementById('themeToggle');
if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');

themeToggle.addEventListener('click', e => {
    e.stopPropagation();
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

// Nav
const nav = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => { navToggle.classList.toggle('active'); navLinks.classList.toggle('active'); });
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { navToggle.classList.remove('active'); navLinks.classList.remove('active'); }));

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

    btn.addEventListener('click', e => {
        e.stopPropagation();
        if (cAudio === au && !au.paused) { au.pause(); tr.classList.remove('playing'); cTrack = cAudio = null; return; }
        if (cAudio && cAudio !== au) { cAudio.pause(); cAudio.currentTime = 0; if (cTrack) cTrack.classList.remove('playing'); }
        au.play().then(() => { tr.classList.add('playing'); cTrack = tr; cAudio = au; }).catch(() => {});
    });

    au.addEventListener('timeupdate', () => { if (!drag) { fill.style.width = (au.currentTime/au.duration*100)+'%'; tc.textContent = fmt(au.currentTime); } });
    au.addEventListener('loadedmetadata', () => { tt.textContent = fmt(au.duration); });
    au.addEventListener('durationchange', () => { if (au.duration && isFinite(au.duration)) tt.textContent = fmt(au.duration); });
    au.addEventListener('ended', () => { tr.classList.remove('playing'); fill.style.width='0%'; tc.textContent='0:00'; cTrack=cAudio=null; });

    function seek(e) {
        const r = bar.getBoundingClientRect(), p = Math.max(0, Math.min((e.clientX-r.left)/r.width, 1));
        if (au.duration && isFinite(au.duration)) { au.currentTime = p*au.duration; fill.style.width=(p*100)+'%'; }
    }

    bar.addEventListener('mousedown', e => { drag=true; seek(e); const m=e=>seek(e), u=()=>{drag=false;document.removeEventListener('mousemove',m);document.removeEventListener('mouseup',u);}; document.addEventListener('mousemove',m); document.addEventListener('mouseup',u); });
    bar.addEventListener('touchstart', e => { drag=true; seek(e.touches[0]); }, {passive:true});
    bar.addEventListener('touchmove', e => { if(drag) seek(e.touches[0]); }, {passive:true});
    bar.addEventListener('touchend', () => { drag=false; });
});

// Form (Netlify)
const form = document.getElementById('contactForm');
if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    const b = form.querySelector('.btn'), o = b.textContent;
    b.textContent = 'Sending...';
    b.disabled = true;

    fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString()
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
