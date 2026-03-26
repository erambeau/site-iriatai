/* ============================================================
   IRIATAI — app.js
   Scroll-driven canvas scrubbing + GSAP animations
   ============================================================ */

"use strict";

/* ── Constantes ── */
const FRAME_COUNT   = 180;
const FRAME_DIR     = "frames/";
const FRAME_EXT     = "webp";
const FRAME_SPEED   = 2.0;   // accélération : animation produit complète à ~50% scroll
const IMAGE_SCALE   = 0.88;  // padded-cover (ne clippe pas dans le header)
const BG_COLOR_DEF  = "#07090F";

/* ── État global ── */
let frames        = [];
let currentFrame  = 0;
let bgColor       = BG_COLOR_DEF;
let canvasReady   = false;
let lenis;

/* ── Éléments DOM ── */
const loader      = document.getElementById("loader");
const loaderBar   = document.getElementById("loader-bar");
const loaderPct   = document.getElementById("loader-percent");
const canvasWrap  = document.getElementById("canvas-wrap");
const canvas      = document.getElementById("canvas");
const ctx         = canvas.getContext("2d");
const heroSection = document.getElementById("hero");
const scrollCont  = document.getElementById("scroll-container");
const darkOverlay = document.getElementById("dark-overlay");
const marqueeWrap = document.getElementById("marquee-manta");
const mantaSvgW   = document.getElementById("manta-svg-wrap");

/* ============================================================
   1. Canvas — redimensionnement DPR
   ============================================================ */
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = window.innerWidth  * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.scale(dpr, dpr);
  if (canvasReady) drawFrame(currentFrame);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* ============================================================
   2. Dessin d'une frame — padded-cover + bg couleur
   ============================================================ */
function drawFrame(index) {
  const img = frames[index];
  if (!img || !img.complete) return;

  const cw = window.innerWidth;
  const ch = window.innerHeight;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  const scale = Math.max(cw / iw, ch / ih) * IMAGE_SCALE;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, dx, dy, dw, dh);
}

/* ── Échantillonnage couleur de bord ── */
function sampleBgColor(img) {
  const offscreen = document.createElement("canvas");
  offscreen.width  = 4;
  offscreen.height = 4;
  const oc = offscreen.getContext("2d");
  oc.drawImage(img, 0, 0, 4, 4);
  const d = oc.getImageData(0, 0, 1, 1).data;
  // Darken légèrement pour éviter les halos
  const r = Math.max(0, d[0] - 10);
  const g = Math.max(0, d[1] - 10);
  const b = Math.max(0, d[2] - 10);
  return `rgb(${r},${g},${b})`;
}

/* ============================================================
   3. Chargement des frames (deux phases)
   ============================================================ */
function framePath(n) {
  const pad = String(n).padStart(4, "0");
  return `${FRAME_DIR}frame_${pad}.${FRAME_EXT}`;
}

function loadFrame(n) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve({ img, n });
    img.onerror = () => resolve({ img: null, n });
    img.src = framePath(n);
    frames[n - 1] = img;
  });
}

async function preloadFrames() {
  // Phase 1 : 10 premières frames (affichage rapide)
  const phase1 = Array.from({ length: 10 }, (_, i) => loadFrame(i + 1));
  await Promise.all(phase1);

  drawFrame(0);
  canvasReady = true;

  // Phase 2 : frames restantes en arrière-plan avec barre de progression
  let loaded = 10;
  const phase2 = Array.from({ length: FRAME_COUNT - 10 }, (_, i) => i + 11);

  const updateProgress = (count) => {
    const pct = Math.round((count / FRAME_COUNT) * 100);
    loaderBar.style.width = pct + "%";
    loaderPct.textContent = pct + "%";
  };

  updateProgress(10);

  await Promise.all(
    phase2.map((n) =>
      loadFrame(n).then((result) => {
        loaded++;
        updateProgress(loaded);
        // Échantillonnage bg toutes les 20 frames
        if (result.img && loaded % 20 === 0) {
          bgColor = sampleBgColor(result.img);
        }
      })
    )
  );

  // Toutes les frames prêtes — cacher le loader
  loaderBar.style.width = "100%";
  loaderPct.textContent = "100%";
  await sleep(400);
  loader.classList.add("hidden");

  // Lancer les animations hero après loader
  setTimeout(animateHero, 600);
}

/* ============================================================
   4. Lenis smooth scroll
   ============================================================ */
function initLenis() {
  lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ============================================================
   5. Positionnement des sections (midpoint enter/leave)
   ============================================================ */
function positionSections() {
  const totalH = scrollCont.offsetHeight;

  document.querySelectorAll(".scroll-section").forEach((section) => {
    const enter = parseFloat(section.dataset.enter) / 100;
    const leave = parseFloat(section.dataset.leave) / 100;
    const mid   = (enter + leave) / 2;
    const topPx = totalH * mid;
    section.style.top = topPx + "px";
  });
}

/* ============================================================
   6. Canvas scrub lié au scroll
   ============================================================ */
function initCanvasScrub() {
  ScrollTrigger.create({
    trigger: scrollCont,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const accelerated = Math.min(self.progress * FRAME_SPEED, 1);
      const index = Math.min(
        Math.floor(accelerated * FRAME_COUNT),
        FRAME_COUNT - 1
      );
      if (index !== currentFrame) {
        currentFrame = index;
        requestAnimationFrame(() => drawFrame(currentFrame));
      }
    },
  });
}

/* ============================================================
   7. Transition hero → canvas (circle wipe)
   ============================================================ */
function initHeroTransition() {
  ScrollTrigger.create({
    trigger: scrollCont,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;

      // Hero s'efface rapidement dès le premier scroll
      const heroOp = Math.max(0, 1 - p * 18);
      heroSection.style.opacity = heroOp;

      // Canvas s'ouvre en cercle
      const wipeP = Math.min(1, Math.max(0, (p - 0.005) / 0.08));
      const radius = wipeP * 80;
      canvasWrap.style.clipPath = `circle(${radius}% at 50% 50%)`;

      // Marquee apparaît entre 8% et 85% du scroll
      const mEnter = 0.08, mLeave = 0.85, mFade = 0.04;
      let mOp = 0;
      if (p >= mEnter && p < mLeave) {
        const fadeIn  = Math.min(1, (p - mEnter) / mFade);
        const fadeOut = Math.min(1, (mLeave - p) / mFade);
        mOp = Math.min(fadeIn, fadeOut);
      }
      marqueeWrap.style.opacity = mOp;
    },
  });
}

/* ============================================================
   8. Overlay sombre (section raie manta)
   ============================================================ */
function initDarkOverlay() {
  const enter    = 0.42;
  const leave    = 0.62;
  const fadeZone = 0.04;

  ScrollTrigger.create({
    trigger: scrollCont,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      let op = 0;

      if (p >= enter - fadeZone && p <= enter) {
        op = ((p - (enter - fadeZone)) / fadeZone) * 0.88;
      } else if (p > enter && p < leave) {
        op = 0.88;
      } else if (p >= leave && p <= leave + fadeZone) {
        op = 0.88 * (1 - (p - leave) / fadeZone);
      }

      darkOverlay.style.opacity = op;
    },
  });
}

/* ============================================================
   9. Marquee horizontal
   ============================================================ */
function initMarquee() {
  const speed = parseFloat(marqueeWrap.dataset.scrollSpeed) || -28;
  gsap.to(marqueeWrap.querySelector(".marquee-text"), {
    xPercent: speed,
    ease: "none",
    scrollTrigger: {
      trigger: scrollCont,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
    },
  });
}

/* ============================================================
   10. Animation de la raie manta (flottement)
   ============================================================ */
function initMantaFloat() {
  // Flottement continu passif
  gsap.to("#manta-svg", {
    y: -18,
    x: 12,
    rotation: 1.5,
    duration: 5,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });

  // Révélation au scroll
  ScrollTrigger.create({
    trigger: scrollCont,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      const enter = 0.44, leave = 0.60, fade = 0.05;
      let op = 0;
      if (p >= enter && p < leave) {
        const fi = Math.min(1, (p - enter) / fade);
        const fo = Math.min(1, (leave - p) / fade);
        op = Math.min(fi, fo);
      }
      mantaSvgW.style.opacity = op;
    },
  });
}

/* ============================================================
   11. Animations des sections scroll
   ============================================================ */
function setupSectionAnimation(section) {
  const type    = section.dataset.animation;
  const persist = section.dataset.persist === "true";
  const enter   = parseFloat(section.dataset.enter) / 100;
  const leave   = parseFloat(section.dataset.leave) / 100;

  const children = section.querySelectorAll(
    ".section-label, .section-heading, .section-body, .manta-quote, .craft-item, .cta-button, .cta-note"
  );

  const tl = gsap.timeline({ paused: true });

  switch (type) {
    case "fade-up":
      tl.from(children, {
        y: 50, opacity: 0,
        stagger: 0.13, duration: 0.9, ease: "power3.out",
      });
      break;

    case "slide-left":
      tl.from(children, {
        x: -70, opacity: 0,
        stagger: 0.14, duration: 0.9, ease: "power3.out",
      });
      break;

    case "slide-right":
      tl.from(children, {
        x: 70, opacity: 0,
        stagger: 0.14, duration: 0.9, ease: "power3.out",
      });
      break;

    case "scale-up":
      tl.from(children, {
        scale: 0.88, opacity: 0,
        stagger: 0.12, duration: 1.0, ease: "power2.out",
      });
      break;

    case "stagger-up":
      tl.from(children, {
        y: 60, opacity: 0,
        stagger: 0.15, duration: 0.85, ease: "power3.out",
      });
      break;

    case "clip-reveal":
      tl.from(children, {
        clipPath: "inset(100% 0 0 0)", opacity: 0,
        stagger: 0.15, duration: 1.2, ease: "power4.inOut",
      });
      break;

    default:
      tl.from(children, {
        y: 40, opacity: 0,
        stagger: 0.12, duration: 0.8, ease: "power3.out",
      });
  }

  ScrollTrigger.create({
    trigger: scrollCont,
    start: "top top",
    end: "bottom bottom",
    scrub: false,
    onUpdate: (self) => {
      const p = self.progress;
      const window_size = 0.12;

      if (p >= enter && (persist || p < leave)) {
        // Dans la fenêtre : jouer vers l'avant
        const localP = Math.min(1, (p - enter) / window_size);
        tl.progress(localP);
        if (!persist) section.style.opacity = "1";
      } else if (!persist && p >= leave) {
        // Après la fenêtre de sortie : effacer
        const fadeOutP = Math.min(1, (p - leave) / 0.06);
        section.style.opacity = String(1 - fadeOutP);
      } else if (p < enter) {
        tl.progress(0);
        section.style.opacity = "0";
      }
    },
  });
}

function initSectionAnimations() {
  document.querySelectorAll(".scroll-section").forEach(setupSectionAnimation);
}

/* ============================================================
   12. Animation hero (après loader)
   ============================================================ */
function animateHero() {
  const tl = gsap.timeline();

  tl.to(".hero-label", {
    opacity: 1, y: 0, duration: 1.0, ease: "power3.out",
  })
  .to(".hero-heading .word", {
    opacity: 1, y: 0,
    stagger: 0.12, duration: 1.0, ease: "power3.out",
  }, "-=0.5")
  .to(".hero-tagline", {
    opacity: 1, y: 0, duration: 0.9, ease: "power3.out",
  }, "-=0.4")
  .to(".hero-scroll-indicator", {
    opacity: 1, duration: 0.8, ease: "power2.out",
  }, "-=0.3");
}

/* ============================================================
   Utilitaires
   ============================================================ */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ============================================================
   Init principale
   ============================================================ */
async function init() {
  gsap.registerPlugin(ScrollTrigger);

  initLenis();
  positionSections();
  initCanvasScrub();
  initHeroTransition();
  initDarkOverlay();
  initMarquee();
  initMantaFloat();
  initSectionAnimations();

  // Démarrer le chargement des frames
  await preloadFrames();
}

// Recalcul des positions si redimensionnement
window.addEventListener("resize", () => {
  positionSections();
  ScrollTrigger.refresh();
});

init();
