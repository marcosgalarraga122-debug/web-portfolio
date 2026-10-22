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
    uniform vec2 r; uniform float t; uniform vec2 m; uniform float s; uniform vec2 v;
    uniform vec3 tr[16]; // recent cursor points: x, y (pixels), time created (seconds)
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.;a*=.5;}return v;}
    void main(){
      vec2 uv=gl_FragCoord.xy/r;
      vec2 p=(gl_FragCoord.xy-.5*r)/r.y;
      vec2 mm=(m-.5*r)/r.y;
      float d=length(p-mm);

      // Ripples spreading out from where the cursor has been
      vec2 disp=vec2(0.);
      float ring=0.;
      for(int i=0;i<16;i++){
        float age=s-tr[i].z;
        if(age>0.&&age<1.3){
          vec2 dv=p-(tr[i].xy-.5*r)/r.y;
          float dist=length(dv);
          // Warp each ripple into an irregular, wobbly shape (seeded by its birth time)
          float seed=tr[i].z*7.3;
          dist*=1.+.12*sin(atan(dv.y,dv.x)*2.+seed);
          dist+=(noise(dv*6.+seed)-.5)*.03;
          float x=dist-age*.35;
          float wave=sin(x*34.)*exp(-x*x*30.)*exp(-age*2.6);
          vec2 n=dv/(length(dv)+.001);
          disp+=n*wave*.015;
          ring+=wave;
        }
      }
      // Air: swirl and push around the cursor depending on how fast it moves
      float ang=length(v)*exp(-d*4.)*1.2;
      float cs=cos(ang),sn=sin(ang);
      p=mm+mat2(cs,-sn,sn,cs)*(p-mm);
      disp-=v*exp(-d*5.)*.8;
      p+=disp;

      vec2 q=vec2(fbm(p*1.4+t*.05),fbm(p*1.4+vec2(5.2,1.3)-t*.04));
      vec2 w=vec2(fbm(p*1.4+4.*q+vec2(1.7,9.2)+t*.07),fbm(p*1.4+4.*q+vec2(8.3,2.8)+t*.05));
      float f=fbm(p*1.4+4.*w+.6*exp(-d*3.));
      vec3 base=vec3(.965,.961,.945);
      vec3 col=mix(base,vec3(.99,.86,.74),clamp(f*f*1.5,0.,1.));
      col=mix(col,vec3(.93,.58,.4),clamp(length(q)*f*.4-.18,0.,1.));
      col=mix(col,vec3(.98,.72,.45),exp(-d*3.5)*.2);
      col=mix(base,col,smoothstep(1.25,.15,length(uv-vec2(.6,.55))*1.5));
      col+=vec3(.008,-.03,-.06)*ring;
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
  const uS = gl.getUniformLocation(prog, "s");
  const uV = gl.getUniformLocation(prog, "v");
  const uTr = gl.getUniformLocation(prog, "tr");
  const trail = new Float32Array(16 * 3).fill(-100);
  let trailIndex = 0, lastPoint = null;

  const start = performance.now();

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

  const mouse = { x: 0.7, y: 0.6 }, smooth = { ...mouse }, vel = { x: 0, y: 0 };
  let prevX = null, prevY = null;
  addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / rect.width;
    mouse.y = 1 - (e.clientY - rect.top) / rect.height;
    if (prevX !== null) {
      vel.x += ((e.clientX - prevX) / rect.height) * 0.5;
      vel.y -= ((e.clientY - prevY) / rect.height) * 0.5;
    }
    prevX = e.clientX; prevY = e.clientY;

    // Drop a new ripple every ~35px of movement
    if (mouse.y < 0 || mouse.y > 1) return;
    if (!lastPoint || Math.hypot(e.clientX - lastPoint.x, e.clientY - lastPoint.y) > 35) {
      lastPoint = { x: e.clientX, y: e.clientY };
      trail.set([mouse.x * w, mouse.y * h, (performance.now() - start) / 1000], trailIndex * 3);
      trailIndex = (trailIndex + 1) % 16;
    }
  });

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  const frame = (now) => {
    if (visible) {
      smooth.x += (mouse.x - smooth.x) * 0.05;
      smooth.y += (mouse.y - smooth.y) * 0.05;
      gl.uniform2f(uR, w, h);
      gl.uniform1f(uT, (now - start) / 1600);
      gl.uniform2f(uM, smooth.x * w, smooth.y * h);
      vel.x *= 0.9; vel.y *= 0.9;
      gl.uniform2f(uV, Math.max(-0.2, Math.min(0.2, vel.x)), Math.max(-0.2, Math.min(0.2, vel.y)));
      gl.uniform1f(uS, (now - start) / 1000);
      gl.uniform3fv(uTr, trail);
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

/* ---------- Hero name: scale it to exactly fill the available width ---------- */
function initNameFit() {
  const name = $(".hero-name");
  const fit = () => {
    const box = name.parentElement;
    const cs = getComputedStyle(box);
    const available = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    name.style.fontSize = "100px";
    const natural = name.offsetWidth;
    const size = (100 * available * 0.88) / natural;
    // Keep it within the screen height on short, wide screens
    name.style.fontSize = `${Math.min(size, innerHeight * 0.2)}px`;
  };
  fit();
  document.fonts.ready.then(fit);
  addEventListener("resize", fit);
}

/* ---------- Hero name: letters near the cursor get thinner and zoom in ---------- */
function initNameWeight(chars) {
  if (!finePointer || reduceMotion) return;
  const name = $(".hero-name");
  addEventListener("pointermove", (e) => {
    if (scrollY > innerHeight) return;
    const base = parseFloat(getComputedStyle(name).fontWeight);
    chars.forEach((c) => {
      const r = c.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      const near = Math.max(0, 1 - d / 350);
      c.style.fontWeight = near > 0 ? Math.round(base - 400 * near) : "";
      c.style.scale = (1 + 0.15 * near).toFixed(3);
      c.style.color = near > 0.6 ? "var(--accent)" : "";
    });
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

/* ---------- Enquiry form: opens the visitor's email app with the message filled in ---------- */
function initContactForm() {
  const form = $(".contact-form");
  const note = $(".form-note", form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form));
    const subject = `Website enquiry — ${d.type}${d.company ? ` (${d.company})` : ""}`;
    const lines = [`Name: ${d.name}`, `Email: ${d.email}`];
    if (d.company) lines.push(`Company: ${d.company}`);
    lines.push(`Project type: ${d.type}`, "", d.message);
    const body = lines.join("\n");
    location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    note.textContent = "Your email app should open now — just press send.";
  });
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

  // About photos: wipe in, then drift at different speeds while scrolling
  $$(".photo").forEach((fig, i) => {
    gsap.from(fig, {
      clipPath: "inset(100% 0% 0% 0%)", duration: 1.4, delay: i * 0.15, ease: "expo.out",
      scrollTrigger: { trigger: ".about-photos", start: "top 80%" },
    });
    gsap.from($("img", fig), {
      scale: 1.4, duration: 1.8, delay: i * 0.15, ease: "expo.out",
      scrollTrigger: { trigger: ".about-photos", start: "top 80%" },
    });
    gsap.fromTo(fig, { y: i ? 70 : -30 }, {
      y: i ? -70 : 30, ease: "none",
      scrollTrigger: { trigger: ".about-photos", start: "top bottom", end: "bottom top", scrub: true },
    });
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

  // Process timeline: line fills and steps light up as you scroll
  $(".process").classList.add("armed");
  gsap.to(".steps-line span", {
    scaleY: 1, ease: "none",
    scrollTrigger: { trigger: ".steps", start: "top 65%", end: "bottom 65%", scrub: true },
  });
  $$(".step").forEach((step) =>
    ScrollTrigger.create({
      trigger: step, start: "top 65%",
      onEnter: () => step.classList.add("active"),
      onLeaveBack: () => step.classList.remove("active"),
    })
  );

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
      v: 100, duration: reduceMotion ? 0.01 : 1, ease: "power2.inOut",
      onUpdate: () => {
        count.textContent = Math.round(n.v);
        bar.style.transform = `scaleX(${n.v / 100})`;
      },
    })
    .to(preloader, { yPercent: -100, duration: reduceMotion ? 0.01 : 0.9 })
    .from(chars, { yPercent: 115, duration: 1.4, stagger: 0.07, ease: "expo.out" }, "-=0.55")
    .from(".hero-fade", { y: 24, opacity: 0, duration: 1, stagger: 0.1, ease: "power3.out" }, "-=1.1")
    .add(finish, "-=0.8");
}

/* ---------- Boot ---------- */
const nameChars = $$(".name-line").flatMap(splitChars);
const aboutWords = splitWords($(".about-text"));
$(".year").textContent = new Date().getFullYear();

initShader();
initScramble();
initNameFit();
initNameWeight(nameChars);
initMagnetic();
initMarquee();
initCopyEmail();
initContactForm();
if (hasGSAP) initScrollAnimations(aboutWords);
intro(nameChars);
