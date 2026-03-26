/* ============================================================
   IRIATAI — app.js
   Scroll-driven canvas scrubbing + GSAP animations
   Architecture :
     1. Canvas DPR + drawFrame
     2. Préchargement des frames (2 phases)
     3. Lenis smooth scroll
     4. Positionnement des sections (midpoint enter/leave)
     5. Canvas scrub lié au scroll
     6. Hero : animation d'entrée + transition vers canvas
     7. Marquee horizontal + opacité
     8. Overlay sombre
     9. Animations des sections scroll
   ============================================================ */

"use strict";

/* ── Constantes ── */
const FRAME_COUNT  = 180;
const FRAME_DIR    = "frames/";
const FRAME_EXT    = "webp";
const FRAME_SPEED  = 2.0;   // animation produit complète à ~50% scroll
const IMAGE_SCALE  = 0.88;  // padded-cover — ne clippe pas dans le header
const BG_COLOR_DEF = "#07090F";

/* ── État global ── */
let frames       = [];
let currentFrame = 0;
let bgColor      = BG_COLOR_DEF;
let canvasReady  = false;
let lenis;

/* ── Éléments DOM ── */
const loader      = document.getElementById("loader");
const loaderBar   = document.getElementById("loader-bar");
const loaderPct   = document.getElementById("loader-percent");
const canvasWrap  = document.getElementById("canvas-wrap");
const canvas      = document.getElementById("canvas");
const ctx         = canvas.getContext("2d");
const scrollCont  = document.getElementById("scroll-container");
const heroSection = document.getElementById("hero");
const marqueeWrap = document.getElementById("marquee-main");

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

window.addEventListener("resize", () => {
  resizeCanvas();
  positionSections();
  ScrollTrigger.refresh();
});

resizeCanvas();

/* ============================================================
   2. Dessin d'une frame — padded-cover + bg samplé
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

/* ── Échantillonnage couleur de bord (coin supérieur gauche) ── */
function sampleBgColor(img) {
  const offscreen = document.createElement("canvas");
  offscreen.width  = 4;
  offscreen.height = 4;
  const oc = offscreen.getContext("2d");
  oc.drawImage(img, 0, 0, 4, 4);
  const d = oc.getImageData(0, 0, 1, 1).data;
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
  // Phase 1 : 10 premières frames — premier rendu rapide
  const phase1 = Array.from({ length: 10 }, (_, i) => loadFrame(i + 1));
  await Promise.all(phase1);

  drawFrame(0);
  canvasReady = true;

  // Phase 2 : frames restantes avec barre de progression
  let loaded = 10;

  const updateProgress = (count) => {
    const pct = Math.round((count / FRAME_COUNT) * 100);
    loaderBar.style.width = pct + "%";
    loaderPct.textContent = pct + "%";
  };

  updateProgress(10);

  await Promise.all(
    Array.from({ length: FRAME_COUNT - 10 }, (_, i) => i + 11).map((n) =>
      loadFrame(n).then((result) => {
        loaded++;
        updateProgress(loaded);
        if (result.img && loaded % 20 === 0) {
          bgColor = sampleBgColor(result.img);
        }
      })
    )
  );

  // Toutes les frames prêtes — masquer le loader
  loaderBar.style.width = "100%";
  loaderPct.textContent = "100%";
  await sleep(400);
  loader.classList.add("hidden");

  // Animer l'entrée du hero après disparition du loader
  animateHeroEntrance();
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
   Les sections sont dans #scroll-container (position relative)
   Les % sont relatifs à la hauteur totale de scroll-container
   ============================================================ */
function positionSections() {
  const totalH = scrollCont.offsetHeight;

  document.querySelectorAll(".scroll-section").forEach((section) => {
    const enter = parseFloat(section.dataset.enter) / 100;
    const leave = parseFloat(section.dataset.leave) / 100;
    const mid   = (enter + leave) / 2;
    section.style.top = (totalH * mid) + "px";
  });
}

/* ============================================================
   6a. Animation d'entrée du hero (déclenché après loader)
   ============================================================ */
function animateHeroEntrance() {
  const label    = heroSection.querySelector(".hero-label");
  const words    = heroSection.querySelectorAll(".word");
  const tagline  = heroSection.querySelector(".hero-tagline");
  const hint     = document.getElementById("hero-scroll-hint");

  const tl = gsap.timeline();

  tl.to(label, {
    opacity: 1, y: 0,
    duration: 0.8, ease: "power3.out",
  })
  .to(words, {
    opacity: 1, y: 0,
    stagger: 0.12, duration: 1.0, ease: "power3.out",
  }, "-=0.3")
  .to(tagline, {
    opacity: 1, y: 0,
    duration: 0.7, ease: "power3.out",
  }, "-=0.4")
  .to(hint, {
    opacity: 1,
    duration: 0.6, ease: "power2.out",
  }, "-=0.2");
}

/* ============================================================
   6b. Transition hero → canvas (circle-wipe au premier scroll)
   Le hero s'efface, le canvas se révèle via clip-path circle
   ============================================================ */
function initHeroTransition() {
  // Le scroll-container est APRÈS le hero dans le flux normal.
  // On utilise le scroll global pour piloter les deux.
  // heroSection fait 100vh hors du scroll-container.
  // Dès que l'utilisateur commence à scroller au-delà du hero,
  // on active le canvas.

  // Ratio de transition : 0 à 8% du scroll-container = ouverture du canvas
  const WIPE_START  = 0.0;   // début du circle-wipe
  const WIPE_END    = 0.08;  // canvas pleinement ouvert
  const HERO_FADE_END = 0.05; // hero invisible à ce point

  ScrollTrigger.create({
    trigger: scrollCont,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;

      // ── Hero : s'efface rapidement dès le début du scroll ──
      const heroOpacity = Math.max(0, 1 - p / HERO_FADE_END);
      heroSection.style.opacity = heroOpacity;

      // ── Canvas : s'ouvre via circle-wipe ──
      const wipeP  = Math.min(1, Math.max(0, (p - WIPE_START) / (WIPE_END - WIPE_START)));
      const radius = wipeP * 80; // de 0% à 80% du viewport
      canvasWrap.style.clipPath = `circle(${radius}% at 50% 50%)`;

      // ── Marquee : visible entre 8% et 85% ──
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
   7. Canvas scrub lié au scroll
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
   8. Marquee horizontal (déplacement lié au scroll)
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
   9. Animations des sections scroll
   Chaque section lit son data-animation et reçoit un effet
   différent. Les sections avec data-persist="true" restent
   visibles une fois animées.
   ============================================================ */
function setupSectionAnimation(section) {
  const type    = section.dataset.animation;
  const persist = section.dataset.persist === "true";
  const enter   = parseFloat(section.dataset.enter) / 100;
  const leave   = parseFloat(section.dataset.leave) / 100;

  const children = section.querySelectorAll(
    ".section-label, .section-heading, .section-body, .craft-item, .cta-button, .cta-note"
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

    case "stagger-up":
      tl.from(children, {
        y: 60, opacity: 0,
        stagger: 0.15, duration: 0.85, ease: "power3.out",
      });
      break;

    case "scale-up":
      tl.from(children, {
        scale: 0.88, opacity: 0,
        stagger: 0.12, duration: 1.0, ease: "power2.out",
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

  // Fenêtre d'animation : 12% du scroll depuis le point d'entrée
  const WINDOW = 0.12;

  ScrollTrigger.create({
    trigger: scrollCont,
    start: "top top",
    end: "bottom bottom",
    scrub: false,
    onUpdate: (self) => {
      const p = self.progress;

      if (p >= enter && (persist || p < leave)) {
        // Dans la fenêtre d'affichage : animer vers l'avant
        const localP = Math.min(1, (p - enter) / WINDOW);
        tl.progress(localP);
        section.style.opacity = "1";
        section.style.pointerEvents = persist ? "auto" : "none";
      } else if (!persist && p >= leave) {
        // Après la fenêtre : effacer progressivement
        const fadeOutP = Math.min(1, (p - leave) / 0.06);
        section.style.opacity = String(1 - fadeOutP);
        section.style.pointerEvents = "none";
      } else {
        // Avant l'entrée : invisible
        tl.progress(0);
        section.style.opacity = "0";
        section.style.pointerEvents = "none";
      }
    },
  });
}

function initSectionAnimations() {
  document.querySelectorAll(".scroll-section").forEach(setupSectionAnimation);
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
  initMarquee();
  initSectionAnimations();

  // Précharger les frames (lance l'animation hero une fois terminé)
  await preloadFrames();
}

init();
