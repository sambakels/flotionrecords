/* ========================================
   FLOTION RECORDS — Liquid Glass Script
   ======================================== */

// ---- Water Ripple Click Effect ----
document.addEventListener('click', (e) => {
    const container = document.getElementById('rippleContainer');
    for (let i = 0; i < 3; i++) {
        const ripple = document.createElement('div');
        ripple.className = 'ripple';
        ripple.style.left = e.clientX + 'px';
        ripple.style.top = e.clientY + 'px';
        ripple.style.animationDelay = (i * 0.12) + 's';
        container.appendChild(ripple);
        setTimeout(() => ripple.remove(), 1200);
    }
});

// ---- Navbar ----
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
});

// ---- Mobile Menu ----
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('active');
    navLinks.classList.toggle('active');
});

navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        navToggle.classList.remove('active');
        navLinks.classList.remove('active');
    });
});

// ---- Smooth Scroll ----
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

// ---- Scroll Reveal ----
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
    });
}, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ---- Counter Animation ----
function animateCounter(el) {
    const target = parseInt(el.getAttribute('data-target'));
    const duration = 2000;
    const start = performance.now();

    function update(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(eased * target);
        if (progress < 1) requestAnimationFrame(update);
        else el.textContent = target;
    }
    requestAnimationFrame(update);
}

const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateCounter(entry.target);
            statObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

document.querySelectorAll('.stat-number').forEach(el => statObserver.observe(el));

// ---- Audio Player ----
let currentTrack = null;
let currentAudio = null;
let isDragging = false;

function formatTime(s) {
    if (isNaN(s) || !isFinite(s)) return '0:00';
    return Math.floor(s / 60) + ':' + (Math.floor(s % 60) < 10 ? '0' : '') + Math.floor(s % 60);
}

document.querySelectorAll('.track').forEach(track => {
    const playBtn = track.querySelector('.track-play');
    const audio = track.querySelector('audio');
    const progressBar = track.querySelector('.progress-bar');
    const progressFill = track.querySelector('.progress-fill');
    const timeCurrent = track.querySelector('.time-current');
    const timeTotal = track.querySelector('.time-total');

    playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentAudio === audio && !audio.paused) {
            audio.pause();
            track.classList.remove('playing');
            currentTrack = null;
            currentAudio = null;
            return;
        }

        if (currentAudio && currentAudio !== audio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            if (currentTrack) currentTrack.classList.remove('playing');
        }

        audio.play().then(() => {
            track.classList.add('playing');
            currentTrack = track;
            currentAudio = audio;
        }).catch(() => {});
    });

    audio.addEventListener('timeupdate', () => {
        if (isDragging) return;
        progressFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
        timeCurrent.textContent = formatTime(audio.currentTime);
    });

    audio.addEventListener('loadedmetadata', () => { timeTotal.textContent = formatTime(audio.duration); });
    audio.addEventListener('durationchange', () => {
        if (audio.duration && isFinite(audio.duration)) timeTotal.textContent = formatTime(audio.duration);
    });

    audio.addEventListener('ended', () => {
        track.classList.remove('playing');
        progressFill.style.width = '0%';
        timeCurrent.textContent = '0:00';
        currentTrack = null;
        currentAudio = null;
    });

    function seek(e) {
        const rect = progressBar.getBoundingClientRect();
        const pct = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
        if (audio.duration && isFinite(audio.duration)) {
            audio.currentTime = pct * audio.duration;
            progressFill.style.width = (pct * 100) + '%';
        }
    }

    progressBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        seek(e);
        const onMove = (e) => seek(e);
        const onUp = () => { isDragging = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    progressBar.addEventListener('touchstart', (e) => { isDragging = true; seek(e.touches[0]); }, { passive: true });
    progressBar.addEventListener('touchmove', (e) => { if (isDragging) seek(e.touches[0]); }, { passive: true });
    progressBar.addEventListener('touchend', () => { isDragging = false; });
});

// ---- Contact Form ----
const form = document.getElementById('contactForm');
if (form) {
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = form.querySelector('.btn');
        const original = btn.textContent;
        btn.textContent = 'Sent!';
        btn.style.background = 'linear-gradient(135deg, rgba(62,184,160,0.4), rgba(94,196,212,0.3))';
        setTimeout(() => { btn.textContent = original; btn.style.background = ''; form.reset(); }, 3000);
    });
}

// ---- Active Nav ----
const sections = document.querySelectorAll('section[id]');
window.addEventListener('scroll', () => {
    const y = window.scrollY + 120;
    sections.forEach(s => {
        const link = document.querySelector(`.nav-links a[href="#${s.id}"]`);
        if (link && !link.classList.contains('nav-cta')) {
            link.style.color = (y >= s.offsetTop && y < s.offsetTop + s.offsetHeight) ? 'var(--white)' : '';
        }
    });
});
