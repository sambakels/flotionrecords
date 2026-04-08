/* ========================================
   FLOTION RECORDS — Main Script
   ======================================== */

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
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ---- Scroll Reveal ----
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, {
    threshold: 0.15,
    rootMargin: '0px 0px -40px 0px'
});

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// Highlight underline animation
document.querySelectorAll('.heading').forEach(el => {
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.querySelectorAll('.highlight').forEach(h => {
                    setTimeout(() => h.classList.add('animated'), 400);
                });
            }
        });
    }, { threshold: 0.3 });
    obs.observe(el);
});

// ---- Counter Animation ----
function animateCounter(element) {
    const target = parseInt(element.getAttribute('data-target'));
    const duration = 2000;
    const start = performance.now();

    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = Math.floor(eased * target);

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = target;
        }
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

// ---- Track List Audio Player ----
let currentTrack = null;
let currentAudio = null;
let isDragging = false;

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

document.querySelectorAll('.track').forEach(track => {
    const playBtn = track.querySelector('.track-play');
    const audio = track.querySelector('audio');
    const progressBar = track.querySelector('.progress-bar');
    const progressFill = track.querySelector('.progress-fill');
    const timeCurrent = track.querySelector('.time-current');
    const timeTotal = track.querySelector('.time-total');

    // Play / Pause
    playBtn.addEventListener('click', () => {
        if (currentAudio === audio && !audio.paused) {
            audio.pause();
            track.classList.remove('playing');
            currentTrack = null;
            currentAudio = null;
            return;
        }

        // Stop other track
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

    // Time update
    audio.addEventListener('timeupdate', () => {
        if (isDragging) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width = pct + '%';
        timeCurrent.textContent = formatTime(audio.currentTime);
    });

    // Loaded metadata — show duration
    audio.addEventListener('loadedmetadata', () => {
        timeTotal.textContent = formatTime(audio.duration);
    });

    // Also try durationchange for browsers that fire it later
    audio.addEventListener('durationchange', () => {
        if (audio.duration && isFinite(audio.duration)) {
            timeTotal.textContent = formatTime(audio.duration);
        }
    });

    // Track ended
    audio.addEventListener('ended', () => {
        track.classList.remove('playing');
        progressFill.style.width = '0%';
        timeCurrent.textContent = '0:00';
        currentTrack = null;
        currentAudio = null;
    });

    // Click on progress bar to seek
    function seek(e) {
        const rect = progressBar.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const pct = x / rect.width;
        if (audio.duration && isFinite(audio.duration)) {
            audio.currentTime = pct * audio.duration;
            progressFill.style.width = (pct * 100) + '%';
        }
    }

    progressBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        seek(e);

        const onMove = (e) => seek(e);
        const onUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // Touch support
    progressBar.addEventListener('touchstart', (e) => {
        isDragging = true;
        seek(e.touches[0]);
    }, { passive: true });

    progressBar.addEventListener('touchmove', (e) => {
        if (isDragging) seek(e.touches[0]);
    }, { passive: true });

    progressBar.addEventListener('touchend', () => {
        isDragging = false;
    });
});

// ---- Contact Form ----
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = contactForm.querySelector('.btn');
        const original = btn.textContent;

        btn.textContent = 'Message Sent!';
        btn.style.background = '#22c55e';

        setTimeout(() => {
            btn.textContent = original;
            btn.style.background = '';
            contactForm.reset();
        }, 3000);
    });
}

// ---- Active Nav Link ----
const sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
    const scrollY = window.scrollY + 120;

    sections.forEach(section => {
        const top = section.offsetTop;
        const height = section.offsetHeight;
        const id = section.getAttribute('id');
        const link = document.querySelector(`.nav-links a[href="#${id}"]`);

        if (link && !link.classList.contains('nav-cta')) {
            if (scrollY >= top && scrollY < top + height) {
                link.style.color = 'var(--white)';
            } else {
                link.style.color = '';
            }
        }
    });
});
