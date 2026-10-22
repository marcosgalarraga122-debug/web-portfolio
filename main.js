const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const hasGSAP = !!(window.gsap && window.ScrollTrigger);
if (hasGSAP) gsap.registerPlugin(ScrollTrigger);
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

/* ---------- Text splitting helpers ---------- */
function splitChars(el) {
  const text = el.textContent;
  el.setAttribute("aria-label", text);
  el.textContent = "";
  return [...text].map((ch) => {
    const s = document.createElement("span");
    s.className = "char";
    s.setAttribute("aria-hidden", "true");
    s.textContent = ch === " " ? " " : ch;
    el.appendChild(s);
    return s;
  });
}

function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = "";
  return words.map((w, i) => {
    const s = document.createElement("span");
    s.className = "w";
    s.textContent = w;
    el.appendChild(s);
    if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
    return s;
  });
}

/* ---------- Smooth scrolling (Lenis) ---------- */
let lenis = null;
if (window.Lenis && !reduceMotion) {
  lenis = new Lenis({ lerp: 0.09 });
  if (hasGSAP) {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
}

$$('a[href^="#"]').forEach((a) =>
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const target = id.length > 1 && $(id);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: "smooth" });
  })
);

/* ---------- WebGL hero background ---------- */
function initShader() {
  const canvas = $(".hero-canvas");
  const gl = canvas.getContext("webgl", { antialias: false });
  if (!gl) { canvas.classList.add("fallback"); return; }

  const vert = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const frag = `
    precision highp float;
    uniform vec2 r; uniform float t; uniform vec2 m;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.;a*=.5;}return v;}
    void main(){
      vec2 uv=gl_FragCoord.xy/r;
      vec2 p=(gl_FragCoord.xy-.5*r)/r.y;
      vec2 mm=(m-.5*r)/r.y;
      float d=length(p-mm);
      vec2 q=vec2(fbm(p*1.4+t*.05),fbm(p*1.4+vec2(5.2,1.3)-t*.04));
      vec2 w=vec2(fbm(p*1.4+4.*q+vec2(1.7,9.2)+t*.07),fbm(p*1.4+4.*q+vec2(8.3,2.8)+t*.05));
      float f=fbm(p*1.4+4.*w+.6*exp(-d*3.));
      vec3 base=vec3(.965,.961,.945);
      vec3 col=mix(base,vec3(.8,.85,.99),clamp(f*f*1.5,0.,1.));
      col=mix(col,vec3(.55,.64,1.),clamp(length(q)*f*.4-.18,0.,1.));
      col=mix(col,vec3(.62,.7,1.),exp(-d*3.5)*.18);
      col=mix(base,col,smoothstep(1.25,.15,length(uv-vec2(.6,.55))*1.5));
      gl_FragColor=vec4(col,1.);
    }`;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(prog, "r");
  const uT = gl.getUniformLocation(prog, "t");
  const uM = gl.getUniformLocation(prog, "m");

  // Render at reduced resolution — the soft gradient doesn't need full detail
  const scale = Math.min(devicePixelRatio, 2) * 0.5;
  let w, h;
  const resize = () => {
    w = canvas.width = Math.max(1, Math.floor(canvas.clientWidth * scale));
    h = canvas.height = Math.max(1, Math.floor(canvas.clientHeight * scale));
    gl.viewport(0, 0, w, h);
  };
  resize();
  addEventListener("resize", resize);

  const mouse = { x: 0.7, y: 0.6 }, smooth = { ...mouse };
  addEventListener("pointermove", (e) => {
    mouse.x = e.clientX / innerWidth;
    mouse.y = 1 - e.clientY / innerHeight;
  });

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  const start = performance.now();
  const frame = (now) => {
    if (visible) {
      smooth.x += (mouse.x - smooth.x) * 0.05;
      smooth.y += (mouse.y - smooth.y) * 0.05;
      gl.uniform2f(uR, w, h);
      gl.uniform1f(uT, (now - start) / 1600);
      gl.uniform2f(uM, smooth.x * w, smooth.y * h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (!reduceMotion) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ---------- Text scramble for the role ---------- */
class Scramble {
  constructor(el) {
    this.el = el;
    this.glyphs = "!-_\\/[]{}=+*^?#%01";
  }
  set(text) {
    const old = this.el.textContent;
    const len = Math.max(old.length, text.length);
    this.queue = [];
    for (let i = 0; i < len; i++) {
      const start = Math.floor(Math.random() * 20);
      this.queue.push({ from: old[i] || "", to: text[i] || "", start, end: start + Math.floor(Math.random() * 20) });
    }
    cancelAnimationFrame(this.raf);
    this.frame = 0;
    this.update();
  }
  update = () => {
    let done = 0;
    this.el.textContent = "";
    for (const q of this.queue) {
      if (this.frame >= q.end) { done++; this.el.append(q.to); }
      else if (this.frame >= q.start) {
        if (!q.ch || Math.random() < 0.28) q.ch = this.glyphs[Math.floor(Math.random() * this.glyphs.length)];
        const s = document.createElement("span");
        s.className = "dud";
        s.textContent = q.ch;
        this.el.append(s);
      } else this.el.append(q.from);
    }
    if (done < this.queue.length) { this.frame++; this.raf = requestAnimationFrame(this.update); }
  };
}

function initScramble() {
  // EDIT: the words that cycle in the hero
  const roles = ["Web Developer", "Web Designer", "UI / UX Designer", "Digital Partner"];
  const s = new Scramble($(".scramble"));
  let i = 0;
  setInterval(() => { i = (i + 1) % roles.length; s.set(roles[i]); }, 3000);
}

/* ---------- Hero name: letters near the cursor get thinner and zoom in ---------- */
function initNameWeight(chars) {
  if (!finePointer || reduceMotion) return;
  addEventListener("pointermove", (e) => {
    if (scrollY > innerHeight) return;
    chars.forEach((c) => {
      const r = c.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      const near = Math.max(0, 1 - d / 350);
      c.style.fontWeight = Math.round(700 - 400 * near);
      c.style.scale = (1 + 0.15 * near).toFixed(3);
      c.style.color = near > 0.6 ? "var(--accent)" : "";
    });
  });
}

/* ---------- Custom cursor ---------- */
function initCursor() {
  if (!finePointer) return;
  document.documentElement.classList.add("has-cursor");
  const dot = $(".cursor-dot"), ring = $(".cursor-ring"), label = $(".cursor-label");
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
  addEventListener("pointermove", (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px)`;
  });
  const loop = () => {
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    requestAnimationFrame(loop);
  };
  loop();
  document.addEventListener("pointerover", (e) => {
    const labelled = e.target.closest("[data-cursor]");
    const link = e.target.closest("a, button");
    // Over a bubble in the playground show "Drag", over the reset button show the normal hover ring
    const showLabel = labelled && !(link && labelled.contains(link) && link !== labelled);
    ring.classList.toggle("is-label", !!showLabel);
    ring.classList.toggle("is-hover", !showLabel && !!link);
    label.textContent = showLabel ? labelled.dataset.cursor : "";
  });
}

/* ---------- Magnetic buttons ---------- */
function initMagnetic() {
  if (!finePointer) return;
  $$(".magnetic").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      el.style.transform = `translate(${x * 0.35}px, ${y * 0.35}px)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });

  // Soft spotlight that follows the cursor across service cards
  $$(".spot").forEach((el) =>
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    })
  );
}

/* ---------- Marquee that speeds up with scroll ---------- */
function initMarquee() {
  const track = $(".marquee-track");
  const original = track.innerHTML;
  track.innerHTML = original.repeat(4);
  if (reduceMotion) return;
  let x = 0, speed = 0;
  const loop = () => {
    const v = lenis ? Math.abs(lenis.velocity) : 0;
    speed += (0.5 + Math.min(v, 40) * 0.12 - speed) * 0.08;
    x -= speed;
    const quarter = track.scrollWidth / 4;
    if (-x >= quarter) x += quarter;
    track.style.transform = `translate3d(${x}px,0,0)`;
    requestAnimationFrame(loop);
  };
  loop();
}

/* ---------- Skills playground (tiny physics engine) ---------- */
function initPlayground() {
  const box = $(".playground");
  const bodies = $$(".bubble", box).map((el) => ({ el, size: +el.dataset.size || 1, r: 0, x: 0, y: 0, vx: 0, vy: 0 }));
  let W = 0, H = 0, running = false, started = false, drag = null;

  const measure = () => {
    W = box.clientWidth;
    H = box.clientHeight;
    const base = Math.max(36, Math.min(68, W / 13));
    bodies.forEach((b) => {
      b.r = base * b.size;
      b.el.style.width = b.el.style.height = `${b.r * 2}px`;
      b.el.style.fontSize = `${Math.max(11, b.r * 0.27)}px`;
    });
  };

  const drop = () => {
    bodies.forEach((b, i) => {
      b.x = b.r + Math.random() * (W - 2 * b.r);
      b.y = -b.r - i * 70 - Math.random() * 80;
      b.vx = (Math.random() - 0.5) * 4;
      b.vy = 0;
    });
  };

  const step = () => {
    for (const b of bodies) {
      if (drag && drag.b === b) continue;
      b.vy += 0.5;
      b.vx *= 0.995; b.vy *= 0.995;
      b.x += b.vx; b.y += b.vy;
      if (b.x < b.r) { b.x = b.r; b.vx *= -0.6; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx *= -0.6; }
      if (b.y > H - b.r) { b.y = H - b.r; b.vy *= -0.45; b.vx *= 0.97; }
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], c = bodies[j];
          const dx = c.x - a.x, dy = c.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const overlap = a.r + c.r - dist;
          if (overlap <= 0) continue;
          const nx = dx / dist, ny = dy / dist;
          const aFixed = drag && drag.b === a, cFixed = drag && drag.b === c;
          const ka = aFixed ? 0 : cFixed ? 1 : 0.5, kc = cFixed ? 0 : aFixed ? 1 : 0.5;
          a.x -= nx * overlap * ka; a.y -= ny * overlap * ka;
          c.x += nx * overlap * kc; c.y += ny * overlap * kc;
          const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (vn < 0) {
            const imp = -1.4 * vn;
            a.vx -= imp * nx * ka; a.vy -= imp * ny * ka;
            c.vx += imp * nx * kc; c.vy += imp * ny * kc;
          }
        }
      }
    }
    for (const b of bodies) b.el.style.transform = `translate(${b.x - b.r}px, ${b.y - b.r}px)`;
  };

  const loop = () => {
    if (!running) return;
    step();
    requestAnimationFrame(loop);
  };

  const local = (e) => {
    const r = box.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  bodies.forEach((b) => {
    b.el.addEventListener("pointerdown", (e) => {
      const p = local(e);
      drag = { b, ox: p.x - b.x, oy: p.y - b.y };
      b.el.setPointerCapture(e.pointerId);
      b.el.style.zIndex = 1;
    });
    b.el.addEventListener("pointermove", (e) => {
      if (!drag || drag.b !== b) return;
      const p = local(e);
      const nx = Math.max(b.r, Math.min(W - b.r, p.x - drag.ox));
      const ny = Math.max(b.r, Math.min(H - b.r, p.y - drag.oy));
      b.vx = nx - b.x; b.vy = ny - b.y;
      b.x = nx; b.y = ny;
    });
    const release = () => {
      if (!drag || drag.b !== b) return;
      b.vx = Math.max(-40, Math.min(40, b.vx));
      b.vy = Math.max(-40, Math.min(40, b.vy));
      b.el.style.zIndex = "";
      drag = null;
    };
    b.el.addEventListener("pointerup", release);
    b.el.addEventListener("pointercancel", release);
  });

  $(".playground-reset").addEventListener("click", () => {
    bodies.forEach((b) => { b.vy = -12 - Math.random() * 14; b.vx = (Math.random() - 0.5) * 30; });
  });

  measure();
  addEventListener("resize", measure);
  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    if (running && !started) { started = true; drop(); }
    if (running) loop();
  }, { threshold: 0.2 }).observe(box);
}

/* ---------- Copy email ---------- */
function initCopyEmail() {
  const btn = $(".copy-email");
  const state = $(".copy-state", btn);
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.email);
      state.textContent = "Copied!";
    } catch {
      location.href = `mailto:${btn.dataset.email}`;
    }
    setTimeout(() => (state.textContent = "Copy"), 2000);
  });
}

/* ---------- Scroll animations (GSAP) ---------- */
function initScrollAnimations(aboutWords) {
  const progress = $(".progress span");
  ScrollTrigger.create({
    start: 0, end: "max",
    onUpdate: (self) => {
      progress.style.transform = `scaleX(${self.progress})`;
      const nav = $(".nav");
      nav.classList.toggle("hidden", self.direction === 1 && self.scroll() > 300);
      nav.classList.toggle("scrolled", self.scroll() > 40);
    },
  });

  // Hero drifts and fades as you scroll away
  gsap.to(".hero-content", {
    yPercent: 25, opacity: 0, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
  });

  // About text lights up word by word
  gsap.fromTo(aboutWords, { opacity: 0.12 }, {
    opacity: 1, stagger: 0.1, ease: "none",
    scrollTrigger: { trigger: ".about-text", start: "top 80%", end: "bottom 45%", scrub: true },
  });

  $$(".reveal-up").forEach((el) =>
    gsap.from(el, {
      y: 60, opacity: 0, duration: 1.2, ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 88%" },
    })
  );

  $$("[data-count]").forEach((el) => {
    const n = { v: 0 };
    gsap.to(n, {
      v: +el.dataset.count, duration: 2, ease: "power3.out",
      onUpdate: () => (el.textContent = Math.round(n.v)),
      scrollTrigger: { trigger: el, start: "top 90%" },
    });
  });

  gsap.from(".contact-title .line > span", {
    yPercent: 110, duration: 1.4, stagger: 0.12, ease: "expo.out",
    scrollTrigger: { trigger: ".contact-title", start: "top 80%" },
  });

  document.fonts.ready.then(() => ScrollTrigger.refresh());
}

/* ---------- Intro (preloader → hero reveal) ---------- */
function intro(chars) {
  const preloader = $(".preloader");
  const finish = () => {
    preloader.remove();
    document.body.classList.remove("loading");
    lenis && lenis.start();
  };
  if (!hasGSAP) { finish(); return; }

  lenis && lenis.stop();
  const count = $(".preloader-count");
  const bar = $(".preloader-bar span");
  const n = { v: 0 };
  gsap.timeline({ defaults: { ease: "expo.inOut" } })
    .to(n, {
      v: 100, duration: reduceMotion ? 0.01 : 1.6, ease: "power2.inOut",
      onUpdate: () => {
        count.textContent = Math.round(n.v);
        bar.style.transform = `scaleX(${n.v / 100})`;
      },
    })
    .to(preloader, { yPercent: -100, duration: reduceMotion ? 0.01 : 1.1 })
    .from(chars, { yPercent: 115, duration: 1.4, stagger: 0.07, ease: "expo.out" }, "-=0.55")
    .from(".hero-fade", { y: 24, opacity: 0, duration: 1, stagger: 0.1, ease: "power3.out" }, "-=1.1")
    .add(finish, "-=0.8");
}

/* ---------- Boot ---------- */
const nameChars = splitChars($(".hero-name"));
const aboutWords = splitWords($(".about-text"));
$(".year").textContent = new Date().getFullYear();

initShader();
initScramble();
initNameWeight(nameChars);
initCursor();
initMagnetic();
initMarquee();
initPlayground();
initCopyEmail();
if (hasGSAP) initScrollAnimations(aboutWords);
intro(nameChars);
