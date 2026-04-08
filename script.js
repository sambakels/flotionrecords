/* ========================================
   FLOTION RECORDS — Main Script
   Professional, clean animations
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

            // Trigger highlight underline animation
            const highlights = entry.target.querySelectorAll('.highlight');
            highlights.forEach(h => h.classList.add('animated'));

            // If the element itself is a highlight parent
            if (entry.target.querySelector('.highlight')) {
                entry.target.querySelectorAll('.highlight').forEach(h => h.classList.add('animated'));
            }
        }
    });
}, {
    threshold: 0.15,
    rootMargin: '0px 0px -40px 0px'
});

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// Also observe headings with highlights directly
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

// ---- Audio Player ----
let currentAudio = null;
let currentCard = null;

document.querySelectorAll('.audio-play').forEach(btn => {
    btn.addEventListener('click', () => {
        const card = btn.closest('.audio-card');
        const audio = card.querySelector('.audio-player');

        // If clicking the same card that's playing, pause it
        if (currentAudio === audio && !audio.paused) {
            audio.pause();
            card.classList.remove('playing');
            currentAudio = null;
            currentCard = null;
            return;
        }

        // Stop any currently playing audio
        if (currentAudio && currentAudio !== audio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            if (currentCard) currentCard.classList.remove('playing');
        }

        // Play new audio
        audio.play().then(() => {
            card.classList.add('playing');
            currentAudio = audio;
            currentCard = card;
        }).catch(() => {
            // Audio file not found or not loaded
            card.classList.remove('playing');
        });

        // Handle audio end
        audio.onended = () => {
            card.classList.remove('playing');
            currentAudio = null;
            currentCard = null;
        };
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

// ---- Active Nav Link on Scroll ----
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
