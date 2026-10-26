const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const hasGSAP = !!(window.gsap && window.ScrollTrigger);
if (hasGSAP) gsap.registerPlugin(ScrollTrigger);
// The scripts arrived: stand down the CSS safety net that would open the page by itself at 7 s
// (styles.css). If they took longer than that, the net has already opened it and stays.
const bootedLate = performance.now() > 6500;
if (!bootedLate) document.documentElement.classList.add("js-boot");

/* ---------- Adaptive quality ----------
   Three tiers: "high" is the full experience; "standard" keeps the same design with lighter
   rendering (a softer-resolution background); "low" puts smooth scrolling
   first, so the heaviest effects use their lightweight versions (no water intro, no grain,
   no frosted-glass blurs). The starting tier comes from what the browser reports; after that
   the frame rate the device actually achieves decides. Within a visit it only ever steps down,
   so qualities never flicker back and forth. ?quality=high|standard|low forces a tier. */
const QUALITIES = ["low", "standard", "high"];
let quality = (() => {
  const forced = new URLSearchParams(location.search).get("quality");
  if (QUALITIES.includes(forced)) return forced;
  const cores = navigator.hardwareConcurrency || 4, memory = navigator.deviceMemory || 8; // deviceMemory: Chromium only
  // (Graphics that are missing or software-rendered also mean "low": initShader finds out)
  if (!window.WebGLRenderingContext || navigator.connection?.saveData || cores <= 2 || memory <= 2) return "low";
  if (cores < 8 || memory < 8 || matchMedia("(max-width: 899px)").matches) return "standard";
  return "high";
})();
document.documentElement.dataset.quality = quality;
const setQuality = (q) => {
  if (QUALITIES.indexOf(q) >= QUALITIES.indexOf(quality)) return;
  quality = q;
  document.documentElement.dataset.quality = q;
  document.dispatchEvent(new CustomEvent("qualitychange", { detail: q }));
};
// Watches the frame rate in short windows (after the intro, and while scrolling) and steps
// down a tier when the median frame stays above ~22 ms (under ~45 fps). Gives up once a few
// windows in a row have been smooth, so it costs nothing for the rest of the visit.
function watchFrameRate() {
  let samples = [], last = 0, running = false, calm = 0, until = 0, since = 0;
  const tick = (now) => {
    if (last && !document.hidden) { const dt = now - last; if (dt < 1000) samples.push(dt); }
    last = now;
    since ||= now;
    // A window is 90 frames, or 1.5 s on a device too slow to show 90 in that time
    if (samples.length >= 90 || (samples.length >= 8 && now - since > 1500)) {
      const sorted = samples.sort((a, b) => a - b), median = sorted[sorted.length >> 1];
      samples = []; since = 0;
      if (median > 22 && quality !== "low") { setQuality(QUALITIES[QUALITIES.indexOf(quality) - 1]); calm = 0; }
      else calm++;
    }
    if (calm >= 3 || quality === "low" || now > until) { running = false; last = 0; since = 0; samples = []; return; }
    requestAnimationFrame(tick);
  };
  const arm = (ms) => {
    if (calm >= 3 || quality === "low") return;
    until = Math.max(until, performance.now() + ms);
    if (!running) { running = true; requestAnimationFrame(tick); }
  };
  arm(6000);
  addEventListener("scroll", () => arm(2500), { passive: true });
}
// Every fresh load starts at the very top. The browser, a leftover #hash and ScrollTrigger's
// own scroll memory can each restore an old position, so all three are switched off here.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
if (location.hash) history.replaceState(null, "", location.pathname + location.search);
if (hasGSAP && ScrollTrigger.clearScrollMemory) ScrollTrigger.clearScrollMemory("manual");
window.scrollTo(0, 0);

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

// Wrap each word in a clipping mask (keeps <br> line breaks) so it can rise into view
function splitMaskWords(el, inner = []) {
  [...el.childNodes].forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== "BR") { splitMaskWords(node, inner); return; }
    if (node.nodeType !== Node.TEXT_NODE) return;
    const frag = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { frag.append(" "); return; }
      const mask = document.createElement("span");
      mask.className = "wm";
      const word = document.createElement("span");
      word.textContent = part;
      mask.append(word);
      frag.append(mask);
      inner.push(word);
    });
    node.replaceWith(frag);
  });
  return inner;
}

// Crossfade a piece of text through a light blur so the swap reads as one motion
function swapText(el, text, onSwap) {
  el.classList.add("swapping");
  setTimeout(() => {
    el.textContent = text;
    onSwap && onSwap();
    el.classList.remove("swapping");
  }, 160);
}

/* ---------- Translations (all text lives in i18n.js) ---------- */
const LANGS = ["en", "es", "fr"];
let lang = (() => {
  let saved = null;
  try { saved = localStorage.getItem("lang"); } catch {}
  if (LANGS.includes(saved)) return saved;
  const browser = (navigator.language || "en").slice(0, 2);
  return LANGS.includes(browser) ? browser : "en";
})();
const t = (key) => window.I18N?.[lang]?.[key] ?? window.I18N?.en?.[key];

function applyTranslations() {
  if (!window.I18N) return; // keep the English in the HTML if i18n.js didn't load
  document.documentElement.lang = lang;
  $$("[data-i18n]").forEach((el) => {
    const text = t(el.dataset.i18n);
    if (text == null) return;
    el.textContent = text;
    if (el.hasAttribute("data-text")) el.dataset.text = text;
  });
  $$("[data-i18n-html]").forEach((el) => {
    const html = t(el.dataset.i18nHtml);
    if (html != null) el.innerHTML = html;
  });
  $$("[data-i18n-attr]").forEach((el) =>
    el.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":");
      const value = t(key);
      if (value != null) el.setAttribute(attr, value);
    })
  );
  document.title = t("meta.title");
  $('meta[name="description"]').setAttribute("content", t("meta.desc"));
}

const roles = () => t("roles") || ["Web Developer", "Web Designer", "UI / UX Designer", "Digital Partner"];

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
// Where smooth scrolling moves the page (mouse and trackpad), pinned sections are held in
// place with transforms, updated in the same frame as the scroll: browsers count a section
// switching to position: fixed as a layout shift, though nothing visibly moves. Touch
// scrolling is native and runs ahead of scripts, so there the fixed pins stay (no wobble).
if (hasGSAP && lenis && finePointer) ScrollTrigger.defaults({ pinType: "transform" });

$$('a[href^="#"]').forEach((a) =>
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const target = id.length > 1 && $(id);
    if (!target || a.hasAttribute("data-cv-open")) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: "smooth" });
  })
);

/* ---------- WebGL hero background ---------- */
function initShader() {
  const canvas = $(".hero-canvas");
  // A context the browser would only software-render (no usable GPU) means the low tier
  let gl = canvas.getContext("webgl", { antialias: false, failIfMajorPerformanceCaveat: true });
  if (!gl) { setQuality("low"); gl = canvas.getContext("webgl", { antialias: false }); }
  if (!gl) { canvas.classList.add("fallback"); return; }
  // Phones can take the graphics context away (a backgrounded tab, low memory): fall back to
  // the CSS gradient in the same colours rather than leave a blank hero
  let lost = false;
  canvas.addEventListener("webglcontextlost", () => { lost = true; canvas.classList.add("fallback"); });

  const vert = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const frag = `
    precision highp float;
    uniform vec2 r; uniform float t; uniform vec2 m; uniform float s; uniform vec2 v;
    uniform vec3 tr[16]; // recent cursor points: x, y (pixels), time created (seconds)
    uniform float lt;    // 0 = dark theme, 1 = light theme
    uniform float dp; uniform vec2 wc; uniform float wk; // intro ripples: pixels per CSS px, impact point, refraction
    ${typeof WATER_RIPPLE === "string" ? WATER_RIPPLE : "vec4 wave(vec2 p){return vec4(0.);}"}
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
    uniform float oct, nt; // octaves of cloud detail, cursor ripples traced (both by quality tier)
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){if(float(i)>=oct)break;v+=a*noise(p);p*=2.;a*=.5;}return v*(.96875/(1.-pow(.5,oct)));}
    void main(){
      vec2 uv=gl_FragCoord.xy/r;
      vec2 p=(gl_FragCoord.xy-.5*r)/r.y;
      vec2 mm=(m-.5*r)/r.y;
      float d=length(p-mm);

      // Ripples spreading out from where the cursor has been
      vec2 disp=vec2(0.);
      float ring=0.;
      for(int i=0;i<16;i++){
        if(float(i)>=nt)break;
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
      // While the intro plays, its ripples refract the background too (see intro.js)
      vec4 iw=wave(vec2(gl_FragCoord.x,r.y-gl_FragCoord.y)/dp-wc);
      p+=vec2(iw.y,-iw.z)*wk*dp/r.y;

      vec2 q=vec2(fbm(p*1.4+t*.05),fbm(p*1.4+vec2(5.2,1.3)-t*.04));
      vec2 w=vec2(fbm(p*1.4+4.*q+vec2(1.7,9.2)+t*.07),fbm(p*1.4+4.*q+vec2(8.3,2.8)+t*.05));
      float f=fbm(p*1.4+4.*w+.6*exp(-d*3.));
      // Dark: bottle green with green-slate clouds. Light: warm parchment with sand-coloured clouds
      vec3 base=mix(vec3(.055,.086,.071),vec3(.957,.933,.89),lt);
      vec3 col=mix(base,mix(vec3(.09,.145,.118),vec3(.905,.86,.78),lt),clamp(f*f*1.6,0.,1.)); // clouds
      col=mix(col,mix(vec3(.4,.32,.19),vec3(.87,.72,.5),lt),clamp(length(q)*f*.4-.2,0.,1.)*.6); // faint brass light
      col=mix(col,mix(vec3(.5,.41,.26),vec3(.82,.64,.4),lt),exp(-d*3.5)*.12);                 // warm glow at the cursor
      col=mix(base,col,smoothstep(1.25,.15,length(uv-vec2(.6,.55))*1.5));
      col+=mix(vec3(.045,.036,.02),vec3(-.04,-.034,-.026),lt)*ring;                            // ripples: lighter on dark, darker on light
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
  const uLt = gl.getUniformLocation(prog, "lt");
  const uOct = gl.getUniformLocation(prog, "oct"), uNt = gl.getUniformLocation(prog, "nt");
  const uW = ["uProf", "uProfS", "uProfA", "dp", "wc", "wk"].map((n) => gl.getUniformLocation(prog, n));
  let profTex = null; // the intro's wave profile, uploaded each frame while it plays
  const setTheme = () => gl.uniform1f(uLt, document.documentElement.dataset.theme === "light" ? 1 : 0);
  setTheme();
  const trail = new Float32Array(16 * 3).fill(-100);
  let trailIndex = 0, lastPoint = null;

  const start = performance.now();

  // Render at reduced resolution — the soft gradient doesn't need full detail. Lower tiers
  // render fewer pixels and octaves, trace fewer cursor ripples, and the low tier draws at
  // 30 fps (the clouds drift slowly enough not to show it)
  const TIER = { high: [0.5, 5, 16, 1], standard: [0.4, 4, 12, 1], low: [0.3, 3, 8, 2] };
  let scale, every = 1, skip = 0;
  let w, h;
  const applyQuality = () => {
    const [k, oct, nt, ev] = TIER[quality];
    scale = Math.min(devicePixelRatio, quality === "low" ? 1.5 : 2) * k;
    every = ev;
    gl.uniform1f(uOct, oct); gl.uniform1f(uNt, nt);
    resize();
  };
  const resize = () => {
    w = canvas.width = Math.max(1, Math.floor(canvas.clientWidth * scale));
    h = canvas.height = Math.max(1, Math.floor(canvas.clientHeight * scale));
    gl.viewport(0, 0, w, h);
  };
  applyQuality();
  addEventListener("resize", resize);
  document.addEventListener("qualitychange", () => { applyQuality(); if (!running) frame(performance.now()); });

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

  // The loop runs only while the hero is on screen, and restarts when it comes back
  let visible = true, running = false;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !running && !reduceMotion) { running = true; requestAnimationFrame(frame); }
  }).observe(canvas);

  const frame = (now) => {
    if (!visible || lost) { running = false; return; }
    if (every > 1 && skip++ % every) { if (!reduceMotion) requestAnimationFrame(frame); return; }
    {
      smooth.x += (mouse.x - smooth.x) * 0.05;
      smooth.y += (mouse.y - smooth.y) * 0.05;
      gl.uniform2f(uR, w, h);
      gl.uniform1f(uT, (now - start) / 1600);
      gl.uniform2f(uM, smooth.x * w, smooth.y * h);
      vel.x *= 0.9; vel.y *= 0.9;
      gl.uniform2f(uV, Math.max(-0.2, Math.min(0.2, vel.x)), Math.max(-0.2, Math.min(0.2, vel.y)));
      gl.uniform1f(uS, (now - start) / 1000);
      gl.uniform3fv(uTr, trail);
      const R = typeof waterRipple === "undefined" ? null : waterRipple;
      if (R) {
        if (!profTex) {
          profTex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, profTex);
          [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach((p) => gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST));
          [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach((p) => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
          gl.uniform1i(uW[0], 0);
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, R.profS[3] || 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, R.profS[3] ? R.prof : new Uint8Array(4));
        gl.uniform4fv(uW[1], R.profS); gl.uniform4fv(uW[2], R.profA);
        gl.uniform1f(uW[3], scale); gl.uniform2f(uW[4], R.C.x, R.C.y); gl.uniform1f(uW[5], R.k);
      } else if (profTex) {
        gl.deleteTexture(profTex);
        profTex = null;
        gl.uniform4f(uW[1], 1, 0, 0, 0);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (!reduceMotion) requestAnimationFrame(frame);
  };
  running = true;
  requestAnimationFrame(frame);
  // Switch palettes with the theme (with reduced motion the single still frame is redrawn)
  document.addEventListener("themechange", () => { setTheme(); if (reduceMotion) frame(performance.now()); });
}

/* ---------- "This is me" ----------
   The section the zoom through the "o" lands on. It is pinned for a screen of scroll while
   the facts come in one by one (see initFacts). Progress is measured in screen heights from
   when the section's top reaches the bottom of the screen (it's underneath the hero then,
   seen only through the "o" — see initPortal). */
function initThisIsMe() {
  const section = $(".portrait");
  if (!section || !hasGSAP || reduceMotion) return;
  ScrollTrigger.create({ trigger: section, start: "top top", end: "+=100%", pin: true });
  const span = 2.5, updateFacts = initFacts();
  ScrollTrigger.create({
    trigger: section, start: "top bottom", end: () => `+=${innerHeight * span}`,
    onUpdate: (self) => updateFacts(self.progress * span),
  });
}

/* ---------- Portal: scrolling travels into the "o" of Marcos ----------
   The hero is pinned for 1.6 screens of scroll. Over that distance the camera dollies into
   the "o" (exponential scale, so the speed feels constant) while the "o" glides to the centre
   of the screen. A soft-edged mask opens in the hero exactly where the letter's counter (its
   hole) is, so through it you see the next section — "This is me" — which sits underneath
   the hero, its text arriving just as the zoom completes.
   Everything is driven by scroll position, so scrolling back up reverses it. */
let portalT = 0;
const PORTAL_HOVER_LIMIT = 0.05; // the name's hover effect works until the zoom passes this point
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeInOutCubic = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);

// Find the centre and radii of the hole inside a letter by drawing it and reading the pixels
function measureCounter(ch) {
  const r = ch.getBoundingClientRect();
  const cs = getComputedStyle(ch);
  const size = parseFloat(cs.fontSize);
  const pad = Math.ceil(size * 0.5);
  const w = Math.ceil(r.width + pad * 2), h = Math.ceil(r.height + pad * 2);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const x = canvas.getContext("2d", { willReadFrequently: true });
  x.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px Fraunces, Georgia, serif`;
  x.textBaseline = "middle";
  x.fillText(ch.textContent, pad, pad + r.height / 2);
  const d = x.getImageData(0, 0, w, h).data;
  const ink = (px, py) => d[(py * w + px) * 4 + 3] > 128;
  // The letter's ink box comes from the font's own metrics, so only four lines of pixels
  // are scanned below, not the whole (very large) letter
  const m = x.measureText(ch.textContent);
  const x0 = Math.max(0, Math.floor(pad - m.actualBoundingBoxLeft)), x1 = Math.min(w - 1, Math.ceil(pad + m.actualBoundingBoxRight));
  const y0 = Math.max(0, Math.floor(pad + r.height / 2 - m.actualBoundingBoxAscent)), y1 = Math.min(h - 1, Math.ceil(pad + r.height / 2 + m.actualBoundingBoxDescent));
  const fallback = { cx: r.left + r.width / 2, cy: r.top + r.height * 0.6, rx: r.width * 0.2, ry: r.height * 0.15 };
  if (x1 <= x0) return fallback;
  const mx = Math.round((x0 + x1) / 2), my = Math.round((y0 + y1) / 2);
  if (ink(mx, my)) return fallback;
  let l = mx, rr = mx, t = my, b = my;
  while (l > x0 && !ink(l, my)) l--;
  while (rr < x1 && !ink(rr, my)) rr++;
  while (t > y0 && !ink(mx, t)) t--;
  while (b < y1 && !ink(mx, b)) b++;
  return { cx: r.left + (l + rr) / 2 - pad, cy: r.top + (t + b) / 2 - pad, rx: (rr - l) / 2, ry: (b - t) / 2 };
}

function initPortal(chars) {
  const hero = $(".hero");
  const name = $(".hero-name");
  const o = chars.find((c) => c.textContent.toLowerCase() === "o");
  if (!hasGSAP || reduceMotion || !o) return; // reduced motion: the hero simply scrolls away
  document.documentElement.classList.add("portal-on");

  const heroCanvas = $(".hero-canvas");
  const top = $(".hero-top"), bottom = $(".hero-bottom");
  const worldCopy = () => $(".portrait-copy");
  let m = null; // measurements at scale 1, relative to the hero

  const measure = () => {
    name.style.transform = "";
    chars.forEach((c) => { c.style.fontWeight = ""; c.style.scale = ""; c.style.color = ""; });
    const hr = hero.getBoundingClientRect(), nr = name.getBoundingClientRect();
    const c = measureCounter(o);
    const W = hero.clientWidth, H = hero.clientHeight;
    const radius = Math.min(c.rx, c.ry) * 0.9;
    m = {
      W, H,
      cx: c.cx - hr.left, cy: c.cy - hr.top,           // the hole's centre, in hero coordinates
      ox: c.cx - nr.left, oy: c.cy - nr.top,           // …and in the name's coordinates (transform origin)
      rx: c.rx * 0.9, ry: c.ry * 0.9,
      // Scale at which the hole covers the whole screen (with a margin for the soft edge)
      end: (Math.hypot(W, H) / 2 / Math.max(1, radius)) * 1.35,
    };
    name.style.transformOrigin = `${m.ox}px ${m.oy}px`;
    document.documentElement.style.setProperty("--hero-h", `${H}px`);
  };

  const render = (t) => {
    if (!m) return;
    // Smooth scrolling can settle a hair above the top; treat that as the top, so no
    // zero-strength blur, mask or transform is left on the hero (they render text soft)
    if (t < 1e-4) t = 0;
    // Hand over from the hover effect to the zoom: reset the letters once the zoom gets going
    if (t > PORTAL_HOVER_LIMIT && portalT <= PORTAL_HOVER_LIMIT) chars.forEach((c) => { c.style.fontWeight = ""; c.style.scale = ""; c.style.color = ""; });
    portalT = t;
    const { W, H } = m;
    const S = Math.pow(m.end, t);                                  // camera dolly
    const glide = easeInOutCubic(Math.min(1, t / 0.55));           // "o" moves to the centre
    const dx = (W / 2 - m.cx) * glide, dy = (H / 2 - m.cy) * glide;
    const open = smoothstep(0.02, 0.16, t);                        // the hole starts to open

    name.style.transform = t > 0 ? `translate(${dx}px, ${dy}px) scale(${S})` : "";
    const rx = Math.max(0.01, m.rx * S * open), ry = Math.max(0.01, m.ry * S * open);
    const mask = t > 0 ? `radial-gradient(${rx}px ${ry}px at ${m.cx + dx}px ${m.cy + dy}px, transparent 78%, #000 100%)` : "";
    hero.style.webkitMaskImage = mask;
    hero.style.maskImage = mask;

    // Everything else in the hero falls away like foreground passing the camera
    const ui = smoothstep(0, 0.3, t);
    for (const [el, dir] of [[top, -1], [bottom, 1]]) {
      el.style.opacity = t > 0 ? 1 - ui : "";
      el.style.transform = t > 0 ? `translateY(${dir * 70 * ui}px) scale(${1 + 0.12 * ui})` : "";
      el.style.filter = t > 0 && quality !== "low" ? `blur(${8 * ui}px)` : "";
    }
    heroCanvas.style.transformOrigin = `${m.cx + dx}px ${m.cy + dy}px`;
    heroCanvas.style.transform = t > 0 ? `scale(${1 + 0.35 * t})` : "";

    const copy = worldCopy();
    if (copy) copy.style.opacity = t > 0 && t < 1 ? smoothstep(0.8, 1, t) : "";

    // Once through, the hero is gone (and can't catch clicks)
    hero.style.visibility = t >= 1 ? "hidden" : "";
  };

  measure();
  ScrollTrigger.create({
    trigger: hero, start: "top top", end: () => `+=${innerHeight * 1.6}`,
    pin: true, invalidateOnRefresh: true,
    onUpdate: (self) => render(self.progress),
    onRefreshInit: () => { name.style.transform = ""; hero.style.maskImage = hero.style.webkitMaskImage = ""; },
    onRefresh: (self) => { measure(); render(self.progress); },
  });
}

/* ---------- Text scramble for the role ---------- */
/* ---------- My story: a route across the four countries I've lived in ----------
   The block pins while you scroll. A camera glides over a dot map of Europe from country
   to country, the route draws itself behind a travelling light, and each chapter's text
   crossfades in. The chapter buttons and the map markers jump straight to a chapter.
   Without GSAP, or with reduced motion, it stays a plain list beside the finished map. */
// One entry per chapter: Spain → Netherlands → Poland → Romania → back to the Netherlands → Madrid
const JOURNEY_STOPS = [0, 1, 2, 3, 1, 0];                 // which map marker each chapter is at
const JOURNEY_CAMERA = [[177, 652, 1.9], [391, 227, 2.2], [717, 242, 1.9], [846, 458, 1.9], [391, 227, 2.2], [500, 430, 1]]; // x, y, zoom
const JOURNEY_COUNTRIES = [1, 2, 3, 4, 4, 4];

function initJourney() {
  const section = $(".journey");
  if (!section) return;
  const pin = $(".journey-pin", section);
  const chapters = $$(".chapter", section);
  const tabs = $$(".chapter-tab", section);
  const markers = $$(".marker", section);
  const lands = $$(".map-country", section);
  const legs = $$(".route-leg", section);
  const cam = $(".map-cam", section);
  const traveller = $(".traveller", section);
  const base = $(".route-base", section);
  const moves = $(".hud-moves", section), countries = $(".hud-countries", section), coords = $(".map-coords", section);
  const lens = legs.map((leg) => leg.getTotalLength());
  const last = chapters.length - 1;
  let active = -1, lastP = -1;

  const setChapter = (i) => {
    if (i === active) return;
    active = i;
    chapters.forEach((c, k) => c.classList.toggle("on", k === i));
    tabs.forEach((b, k) => b.setAttribute("aria-current", k === i ? "step" : "false"));
    markers.forEach((m, k) => m.classList.toggle("on", k === JOURNEY_STOPS[i]));
    swapText(moves, String(i).padStart(2, "0"));
    swapText(countries, String(JOURNEY_COUNTRIES[i]).padStart(2, "0"));
    swapText(coords, markers[JOURNEY_STOPS[i]].dataset.coords);
  };

  // p runs from 0 (Spain) to `last` (the zoomed-out "today" view); whole numbers hold on a chapter
  const render = (p) => {
    if (p === lastP) return;
    lastP = p;
    const k = Math.min(last - 1, Math.floor(p));
    const u = smoothstep(0.2, 0.85, p - k);
    const a = JOURNEY_CAMERA[k], b = JOURNEY_CAMERA[k + 1];
    const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
    // Pull back a little mid-flight, like a camera following a plane
    const z = (a[2] + (b[2] - a[2]) * u) * (1 - 0.22 * Math.sin(Math.PI * u) * (k < last - 1));
    cam.setAttribute("transform", `translate(500 414) scale(${z}) translate(${-x} ${-y})`);
    // Lines and markers keep their on-screen size while the map zooms
    legs.forEach((leg) => (leg.style.strokeWidth = 2.4 / z));
    base.style.strokeWidth = 1.5 / z;
    markers.forEach((m) => m.firstElementChild.setAttribute("transform", `scale(${1 / z})`));

    let head = null;
    legs.forEach((leg, i) => {
      const drawn = i < k ? 1 : i > k ? 0 : k < legs.length ? u : 1;
      leg.style.strokeDasharray = lens[i];
      leg.style.strokeDashoffset = lens[i] * (1 - drawn);
      if (drawn > 0 && drawn < 1) head = leg.getPointAtLength(lens[i] * drawn);
    });
    traveller.style.opacity = head ? 1 : 0;
    if (head) traveller.setAttribute("transform", `translate(${head.x} ${head.y}) scale(${1 / z})`);
    // A country lights up once the light first arrives there
    lands.forEach((l, c) => l.classList.toggle("visited", JOURNEY_STOPS.some((stop, j) => stop === c && (j === 0 || p >= j - 1 + 0.85))));
    setChapter(Math.min(last, Math.round(p)));
  };

  if (!hasGSAP || reduceMotion) { render(last); return; }
  document.documentElement.classList.add("journey-on");

  const st = ScrollTrigger.create({
    trigger: pin, start: "top top", end: () => `+=${innerHeight * 4.2}`, pin: true,
    onUpdate: (self) => render(self.progress * last),
  });
  render(0);

  const goTo = (i) => {
    const target = st.start + (st.end - st.start) * (i / last);
    if (lenis) lenis.scrollTo(target, { duration: 1.4 });
    else scrollTo({ top: target, behavior: "smooth" });
  };
  tabs.forEach((b) => b.addEventListener("click", () => goTo(+b.dataset.chapter)));
  markers.forEach((m) => m.addEventListener("click", () => goTo(+m.dataset.chapter)));

  // The "border" under the statement draws in, then its dots drift apart as you scroll on
  const dots = $(".border-dots", section);
  gsap.timeline({ scrollTrigger: { trigger: dots, start: "top 90%", end: "top 25%", scrub: true } })
    .fromTo(dots, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", ease: "none", duration: 1 })
    .to(dots, { "--gap": "56px", opacity: 0.35, ease: "none", duration: 1.4 });
}

/* ---------- Services: cards that travel sideways ----------
   Large screens: the section pins and vertical scrolling moves the row of cards sideways,
   each card's big outline numeral drifting at its own pace. Phones: a native swipeable row
   (no pinning). Reduced motion on large screens: a plain grid. */
function initServicesTrack() {
  const root = document.documentElement;
  const section = $(".services"), track = $(".service-track");
  const cards = $$(".service", track);
  const count = $(".services-count b"), bar = $(".services-progress span");
  let current = -1;
  const setProgress = (p) => {
    bar.style.transform = `scaleX(${(1 + p * (cards.length - 1)) / cards.length})`;
    const i = Math.min(cards.length - 1, Math.round(p * (cards.length - 1)));
    if (i === current) return;
    current = i;
    cards.forEach((c, k) => c.classList.toggle("lit", k === i));
    swapText(count, String(i + 1).padStart(2, "0"));
  };
  setProgress(0);
  track.addEventListener("scroll", () => {
    const max = track.scrollWidth - track.clientWidth;
    setProgress(max > 0 ? track.scrollLeft / max : 0);
  }, { passive: true });
  if (!hasGSAP) return;

  gsap.matchMedia().add({
    move: "(min-width: 900px) and (prefers-reduced-motion: no-preference)",
    still: "(min-width: 900px) and (prefers-reduced-motion: reduce)",
  }, (ctx) => {
    if (ctx.conditions.still) { root.classList.add("no-track"); return () => root.classList.remove("no-track"); }
    root.classList.add("track-on");
    const distance = () => track.scrollWidth - track.clientWidth;
    const tween = gsap.to(track, {
      x: () => -distance(), ease: "none",
      scrollTrigger: {
        trigger: section, start: "top top", end: () => `+=${distance()}`,
        pin: true, scrub: true, invalidateOnRefresh: true,
        onUpdate: (self) => setProgress(self.progress),
      },
    });
    cards.forEach((card) => gsap.fromTo($(".service-index", card), { xPercent: 22 }, {
      xPercent: -22, ease: "none",
      scrollTrigger: { trigger: card, containerAnimation: tween, start: "left right", end: "right left", scrub: true },
    }));
    return () => root.classList.remove("track-on");
  });
}

/* ---------- Why me: covered cards ease back as the next one slides over ---------- */
function initWhyStack() {
  if (!hasGSAP) return;
  const cards = $$(".why-item");
  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    cards.slice(0, -1).forEach((card, i) => {
      const scrollTrigger = { trigger: cards[i + 1], start: "top bottom", end: "top 35%", scrub: true };
      gsap.to(card, { scale: 0.93, ease: "none", scrollTrigger });
      gsap.to(card.children, { opacity: 0.3, ease: "none", scrollTrigger });
    });
  });
}

/* ---------- Contact: a panel that opens out to the full width as it arrives ---------- */
function initContactCurtain() {
  if (!hasGSAP) return;
  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    gsap.fromTo(".contact", { clipPath: "inset(0% 4% 0% 4% round 40px)" }, {
      clipPath: "inset(0% 0% 0% 0% round 0px)", ease: "none",
      scrollTrigger: { trigger: ".contact", start: "top bottom", end: "top 10%", scrub: true },
    });
  });
}

/* ---------- Theme: dark (default) or a lighter, warmer version ----------
   The choice is remembered. Where the browser supports view transitions, the new theme
   opens as a circle from the button; otherwise (or with reduced motion) it switches at once. */
let refreshThemeLabel = () => {};
function initThemeToggle() {
  const btn = $(".theme-toggle");
  const root = document.documentElement;
  const meta = $('meta[name="theme-color"]');
  const current = () => (root.dataset.theme === "light" ? "light" : "dark");
  refreshThemeLabel = () => btn.setAttribute("aria-label", t(current() === "light" ? "theme.toDark" : "theme.toLight"));
  const apply = (theme) => {
    root.dataset.theme = theme;
    meta.setAttribute("content", theme === "light" ? "#f4eee3" : "#0e1612");
    try { localStorage.setItem("theme", theme); } catch {}
    refreshThemeLabel();
    document.dispatchEvent(new Event("themechange"));
  };
  meta.setAttribute("content", current() === "light" ? "#f4eee3" : "#0e1612");
  refreshThemeLabel();

  btn.addEventListener("click", () => {
    const next = current() === "light" ? "dark" : "light";
    if (!document.startViewTransition || reduceMotion) { apply(next); return; }
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(() => apply(next)).ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 700, easing: "cubic-bezier(.77, 0, .175, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    });
  });
}

/* ---------- CV: a sheet of paper that opens over the page ----------
   The hero's "View my CV" button (and the nav's CV link) open it in a dialog; it settles into
   place, a soft light follows the cursor across the paper, and brass highlighter strokes sweep
   over the key points as they come into view. */
function initCV() {
  const sheet = $(".cv-sheet");
  const modal = $(".cv-modal");
  if (!sheet || !modal) return;
  const root = document.documentElement;
  const open = (e) => {
    e.preventDefault();
    if (modal.open) return;
    modal.classList.remove("closing");
    modal.scrollTop = 0;
    root.classList.add("cv-open");
    lenis && lenis.stop();
    modal.showModal();
  };
  // Esc, the close button and a click beside the sheet all close it, with a short fade
  const close = () => {
    if (!modal.open || modal.classList.contains("closing")) return;
    modal.classList.add("closing");
    setTimeout(() => modal.close(), reduceMotion ? 0 : 180);
  };
  $$("[data-cv-open]").forEach((a) => a.addEventListener("click", open));
  $("[data-cv-close]", modal).addEventListener("click", close);
  modal.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  modal.addEventListener("click", (e) => e.target === modal && close());
  modal.addEventListener("close", () => {
    modal.classList.remove("closing");
    root.classList.remove("cv-open");
    lenis && lenis.start();
  });
  const marks = () => $$(".cv-sheet mark");
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    io.unobserve(e.target);
  }), { rootMargin: "0px 0px -18% 0px", threshold: 1 });
  marks().forEach((m) => io.observe(m));
  // After a language change the marks are new elements: ones already read appear at once,
  // the rest still wait for their sweep
  refreshCV = () => marks().forEach((m) => (modal.open && m.getBoundingClientRect().bottom < innerHeight * 0.82 ? m.classList.add("in") : io.observe(m)));

  if (finePointer) {
    const glare = $(".cv-glare", sheet);
    sheet.addEventListener("pointermove", (e) => {
      const r = sheet.getBoundingClientRect();
      glare.style.background = `radial-gradient(600px circle at ${e.clientX - r.left}px ${e.clientY - r.top}px, rgba(255, 255, 255, .5), transparent 60%)`;
      glare.style.opacity = 1;
    });
    sheet.addEventListener("pointerleave", () => (glare.style.opacity = 0));
  }
}
let refreshCV = () => {};

/* ---------- Cookies: asked every time the site is opened ----------
   The answer is deliberately not saved, so the card returns on every visit. Nothing optional
   runs unless the visitor accepts; the answer is on window.cookieConsent, and a
   "cookieconsent" event announces it. */
let showConsent = () => {};
function initConsent() {
  const box = $(".consent");
  if (!box) return;
  // Optional cookies (visit analytics) start here, and only once the visitor accepts
  const loadOptional = () => startAnalytics();
  window.cookieConsent = null;
  $$("[data-consent]", box).forEach((b) => b.addEventListener("click", () => {
    window.cookieConsent = b.dataset.consent;
    document.dispatchEvent(new CustomEvent("cookieconsent", { detail: b.dataset.consent }));
    if (b.dataset.consent === "accepted") loadOptional();
    else stopAnalytics();
    box.classList.remove("in");
    liftFab(0);
    setTimeout(() => (box.hidden = true), reduceMotion ? 0 : 300);
  }));
  showConsent = () => {
    box.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("in")));
    // The chat button moves up above the banner while it's showing
    const fit = () => { if (!box.hidden) liftFab(innerHeight - box.getBoundingClientRect().top); };
    requestAnimationFrame(fit);
    new ResizeObserver(fit).observe(box);
  };
}

/* ---------- Visit analytics (only after "Accept" in the cookie banner) ----------
   Sends page views, opening the assistant, chat questions and contact clicks to the
   assistant's backend (see backend/src/analytics.js), with a random ID kept in this browser.
   Nothing is sent, and the ID is removed, when the visitor rejects. */
const ASSIST_API = (document.querySelector('meta[name="assistant-api"]')?.content || "").replace(/\/$/, "");
const VISITOR_KEY = "mas_vid";
let analyticsOn = false;
const visitorId = () => {
  if (!analyticsOn) return null;
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!/^[0-9a-f]{32}$/.test(id || "")) {
      id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch { return null; }
};
function track(type, detail) {
  const id = visitorId();
  if (!ASSIST_API || !id) return;
  const coarse = matchMedia("(pointer: coarse)").matches;
  fetch(`${ASSIST_API}/api/event`, {
    method: "POST", keepalive: true, headers: { "content-type": "text/plain" },
    body: JSON.stringify({
      type, detail, visitorId: id, path: location.pathname, lang,
      referrer: type === "pageview" ? document.referrer : undefined,
      device: !coarse ? "desktop" : Math.min(screen.width, screen.height) >= 600 ? "tablet" : "mobile",
    }),
  }).catch(() => {});
}
function startAnalytics() {
  if (analyticsOn || !ASSIST_API) return;
  analyticsOn = true;
  track("pageview");
  document.addEventListener("click", (e) => {
    if (e.target.closest(".assist")) return; // the chat reports its own contact clicks
    if (e.target.closest(".copy-email")) track("contact_click", "email_copy");
    else if (e.target.closest('a[href^="mailto:"]')) track("contact_click", "email_link");
    else if (e.target.closest('a[href$=".pdf"]')) track("contact_click", "cv_download");
  });
  $(".contact-form")?.addEventListener("submit", (e) => { if (e.currentTarget.checkValidity()) track("contact_click", "contact_form"); });
}
function stopAnalytics() {
  analyticsOn = false;
  try { localStorage.removeItem(VISITOR_KEY); } catch {}
}

/* ---------- Marcos's AI Assistant: the floating button ----------
   The button is part of the page; the chat window (assistant.js + assistant.css) only
   downloads when a visitor first uses it, and its replies come from the backend set in
   <meta name="assistant-api">. With no backend configured the button stays hidden. */
let liftFab = () => {};
function initAssistant() {
  const fab = $(".assist-fab");
  if (!fab || !ASSIST_API) return;
  fab.hidden = false;
  document.documentElement.classList.add("has-assist");
  liftFab = (px) => fab.style.setProperty("--fab-lift", `${Math.max(0, px)}px`);
  const version = ($('script[src^="main.js"]')?.getAttribute("src").split("?v=")[1]) || "";
  let loading = null;
  const load = () => loading ||= new Promise((resolve, reject) => {
    const css = Object.assign(document.createElement("link"), { rel: "stylesheet", href: `assistant.css?v=${version}` });
    const js = Object.assign(document.createElement("script"), { src: `assistant.js?v=${version}`, async: true });
    let left = 2;
    const done = () => { if (--left === 0) resolve(); };
    css.onload = done; js.onload = done;
    css.onerror = js.onerror = () => { loading = null; reject(new Error("assistant failed to load")); };
    document.head.append(css, js);
  }).then(() => window.MarcosAssistant.init({
    api: ASSIST_API, fab, reduceMotion,
    email: $(".copy-email")?.dataset.email || "",
    lang: () => lang,
    section: () => $(".where-text")?.textContent.trim().slice(0, 60) || (scrollY < innerHeight ? "hero" : ""),
    visitorId, track,
    pauseScroll: (on) => lenis && (on ? lenis.stop() : lenis.start()),
    goToContact: () => {
      const target = $("#contact");
      if (lenis) lenis.scrollTo(target, { duration: 1.4 }); else target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      setTimeout(() => $("#cf-name")?.focus({ preventScroll: true }), 900);
    },
  }));
  // Start fetching as soon as the visitor shows intent, so the window opens instantly
  for (const ev of ["pointerenter", "focus", "touchstart"]) fab.addEventListener(ev, () => load().catch(() => {}), { once: true, passive: true });
  fab.addEventListener("click", async () => {
    fab.classList.add("busy");
    try { await load(); window.MarcosAssistant.toggle(); }
    catch { location.hash = "contact"; }               // couldn't load: fall back to the contact section
    finally { fab.classList.remove("busy"); }
  });
}

/* ---------- "You are here": the current section's number and name, bottom left ---------- */
let refreshWhere = () => {};
function initSectionIndex() {
  const where = $(".where"), text = $(".where-text", where);
  let current = null;
  const render = () => {
    const label = current && $(".label", current);
    if (!label) return;
    const num = document.createElement("span");
    num.className = "lnum";
    num.textContent = $(".lnum", label).textContent;
    text.replaceChildren(num, label.lastElementChild.textContent);
  };
  refreshWhere = render;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const numbered = !!$(".lnum", e.target);
      where.classList.toggle("show", numbered);
      if (!numbered || e.target === current) return;
      const first = !current;
      current = e.target;
      if (first) render();
      else { text.classList.add("swapping"); setTimeout(() => { render(); text.classList.remove("swapping"); }, 160); }
    });
  }, { rootMargin: "-50% 0px -50% 0px" });
  $$("main > section").forEach((s) => io.observe(s));
}

// "This is me" facts: while the section is pinned, each row draws its hairline and its value
// decodes in, one after another; as you scroll on they leave in reverse order
function initFacts() {
  const rows = $$(".fact");
  if (!rows.length) return () => {};
  document.documentElement.classList.add("facts-anim");
  const decoders = rows.map((r) => { const v = $("[data-decode]", r); return v && new Scramble(v); });
  return (s) => rows.forEach((row, i) => {
    const on = s > 1.05 + i * 0.15 && s < 2.14 - i * 0.04;
    if (on === row.classList.contains("on")) return;
    row.classList.toggle("on", on);
    if (on && decoders[i]) decoders[i].set(t(decoders[i].el.dataset.i18n));
  });
}

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

// The words that cycle in the hero are the "roles" lists in i18n.js
let scramble = null, roleIndex = 0;
function initScramble() {
  const el = $(".scramble");
  el.textContent = roles()[0];
  scramble = new Scramble(el);
  let onScreen = true;
  new IntersectionObserver(([e]) => (onScreen = e.isIntersecting)).observe(el);
  setInterval(() => {
    if (!onScreen || document.hidden) return;
    roleIndex = (roleIndex + 1) % roles().length;
    scramble.set(roles()[roleIndex]);
  }, 3500);
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
  return fit;
}

/* ---------- Hero name: letters near the cursor get thinner and zoom in ---------- */
function initNameWeight(chars) {
  if (!finePointer || reduceMotion) return;
  const name = $(".hero-name");
  // Pointer events can arrive several times a frame: keep the latest and update once per
  // frame, measuring every letter first and only then restyling them (measuring between
  // style changes would make the browser lay the name out again for every letter)
  let px = 0, py = 0, queued = false;
  const update = () => {
    queued = false;
    // Paused only once the zoom into the "o" is really under way (smooth scrolling can
    // leave the page a fraction of a pixel from the top, which used to switch it off)
    if (scrollY > innerHeight || portalT > PORTAL_HOVER_LIMIT || document.documentElement.classList.contains("intro-active")) return;
    const base = parseFloat(getComputedStyle(name).fontWeight);
    const near = chars.map((c) => {
      const r = c.getBoundingClientRect();
      return Math.max(0, 1 - Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2)) / 350);
    });
    chars.forEach((c, i) => {
      c.style.fontWeight = near[i] > 0 ? Math.round(base - 400 * near[i]) : "";
      c.style.scale = (1 + 0.15 * near[i]).toFixed(3);
      c.style.color = near[i] > 0.6 ? "var(--accent)" : "";
    });
  };
  addEventListener("pointermove", (e) => {
    px = e.clientX; py = e.clientY;
    if (!queued) { queued = true; requestAnimationFrame(update); }
  });
}

/* ---------- Magnetic buttons ---------- */
function initMagnetic() {
  if (!finePointer || reduceMotion) return;
  // Spring physics instead of snapping to the cursor: the pull has momentum and
  // settles naturally, and can be interrupted mid-motion without a jump
  $$(".magnetic").forEach((el) => {
    const s = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, running: false };
    const tick = () => {
      s.vx = (s.vx + (s.tx - s.x) * 0.15) * 0.72;
      s.vy = (s.vy + (s.ty - s.y) * 0.15) * 0.72;
      s.x += s.vx; s.y += s.vy;
      el.style.translate = `${s.x.toFixed(2)}px ${s.y.toFixed(2)}px`;
      const settled = Math.abs(s.tx - s.x) < 0.05 && Math.abs(s.ty - s.y) < 0.05 && Math.abs(s.vx) + Math.abs(s.vy) < 0.05;
      if (settled) { s.running = false; return; }
      requestAnimationFrame(tick);
    };
    const kick = () => { if (!s.running) { s.running = true; requestAnimationFrame(tick); } };
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      s.tx = (e.clientX - r.left - r.width / 2) * 0.3;
      s.ty = (e.clientY - r.top - r.height / 2) * 0.3;
      kick();
    });
    el.addEventListener("pointerleave", () => { s.tx = 0; s.ty = 0; kick(); });
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
function renderMarquee() {
  const items = t("marquee") || ["Web Design", "Web Development", "UI / UX", "Responsive Websites", "SEO", "Performance"];
  $(".marquee-track").innerHTML = items.map((w) => `<span>${w}</span><b>/</b>`).join("").repeat(4);
}

function initMarquee() {
  const track = $(".marquee-track");
  renderMarquee();
  if (reduceMotion) return;
  let x = 0, speed = 0, quarter = 0, onScreen = false, running = false;
  new ResizeObserver(() => (quarter = track.scrollWidth / 4)).observe(track);
  const loop = () => {
    if (!onScreen) { running = false; return; }
    const v = lenis ? Math.abs(lenis.velocity) : 0;
    speed += (0.5 + Math.min(v, 40) * 0.12 - speed) * 0.08;
    x -= speed;
    if (quarter && -x >= quarter) x += quarter;
    track.style.transform = `translate3d(${x}px,0,0)`;
    requestAnimationFrame(loop);
  };
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen && !running) { running = true; requestAnimationFrame(loop); }
  }).observe(track.parentElement);
}

/* ---------- Enquiry form: opens the visitor's email app with the message filled in ---------- */
function initContactForm() {
  const form = $(".contact-form");
  const note = $(".form-note", form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form));
    const subject = `${t("mail.subject")}${d.company ? ` — ${d.company}` : ""}`;
    const lines = [`${t("mail.name")}: ${d.name}`, `${t("mail.email")}: ${d.email}`];
    if (d.company) lines.push(`${t("mail.company")}: ${d.company}`);
    lines.push("", d.message);
    const body = lines.join("\n");
    location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const label = $(".btn-label", form);
    swapText(label, t("form.opening"));
    swapText(note, t("form.opened"));
    setTimeout(() => swapText(label, t("form.send")), 3000);
  });
}

/* ---------- Underline the menu link for the section in view ---------- */
function initNavActive() {
  const links = new Map($$(".nav-links a").map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((a) => a.classList.remove("active"));
      links.get(entry.target.id)?.classList.add("active");
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("main section[id]").forEach((s) => io.observe(s));
}

/* ---------- Copy email ---------- */
function initCopyEmail() {
  const btn = $(".copy-email");
  const state = $(".copy-state", btn);
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.email);
      swapText(state, t("copied"), () => state.classList.add("done"));
      clearTimeout(state.timer);
      state.timer = setTimeout(() => swapText(state, t("copy"), () => state.classList.remove("done")), 2000);
    } catch {
      location.href = `mailto:${btn.dataset.email}`;
    }
  });
}

/* ---------- About text lights up word by word as you scroll ---------- */
let aboutTween = null;
function makeAboutScrub(words) {
  if (aboutTween) { aboutTween.scrollTrigger?.kill(); aboutTween.kill(); }
  aboutTween = gsap.fromTo(words, { opacity: 0.12 }, {
    opacity: 1, stagger: 0.1, ease: "none",
    scrollTrigger: { trigger: ".about-text", start: "top 80%", end: "bottom 45%", scrub: true },
  });
}

/* ---------- Stat numbers roll into place like an odometer ---------- */
function initOdometers() {
  $$(".odo").forEach((odo) => {
    const value = odo.dataset.value;
    odo.textContent = "";
    const label = document.createElement("span");
    label.className = "sr-only";
    label.textContent = value;
    odo.append(label);
    const strips = [...value].map((ch) => {
      const digit = document.createElement("span");
      digit.className = "odo-digit";
      digit.setAttribute("aria-hidden", "true");
      const strip = document.createElement("span");
      strip.className = "odo-strip";
      for (let k = 0; k < 30; k++) {
        const n = document.createElement("span");
        n.textContent = k % 10;
        strip.append(n);
      }
      digit.append(strip);
      odo.append(digit);
      return { strip, d: +ch };
    });
    const stat = odo.closest(".stat");
    if (reduceMotion) {
      strips.forEach(({ strip, d }) => { strip.style.transition = "none"; strip.style.transform = `translateY(${(-d / 30) * 100}%)`; });
      odo.classList.add("rolled");
      stat?.classList.add("in");
      return;
    }
    // Spin through two full turns and land on the digit (left digits first) while
    // coming into focus; then a hairline draws underneath
    const roll = () => {
      strips.forEach(({ strip, d }, j) => {
        strip.style.transitionDelay = `${j * 120}ms`;
        strip.style.transform = `translateY(${(-(20 + d) / 30) * 100}%)`;
      });
      odo.classList.add("rolled");
      stat?.classList.add("in");
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { roll(); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(odo);
  });
}

/* ---------- Language switcher: pill slides, text blurs out, swaps and blurs back in ---------- */
function rebuildAfterLanguageChange() {
  const words = splitWords($(".about-text"));
  if (hasGSAP) makeAboutScrub(words);
  renderMarquee();
  refreshWhere();
  refreshCV();
  refreshThemeLabel();
  if (scramble) {
    cancelAnimationFrame(scramble.raf);
    $(".scramble").textContent = roles()[roleIndex % roles().length];
  }
  if (hasGSAP) ScrollTrigger.refresh();
}

function initLangSwitch() {
  const box = $(".lang");
  const pill = $(".lang-pill", box);
  const buttons = $$("button", box);
  const place = (instant) => {
    const active = buttons.find((b) => b.dataset.lang === lang) || buttons[0];
    if (instant) pill.style.transition = "none";
    pill.style.width = `${active.offsetWidth}px`;
    pill.style.translate = `${active.offsetLeft}px 0`;
    buttons.forEach((b) => b.setAttribute("aria-pressed", b === active));
    if (instant) { void pill.offsetWidth; pill.style.transition = ""; }
  };
  place(true);
  document.fonts.ready.then(() => place(true));

  buttons.forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.lang === lang) return;
    lang = b.dataset.lang;
    try { localStorage.setItem("lang", lang); } catch {}
    place(false);
    document.body.classList.add("lang-swapping");
    setTimeout(() => {
      applyTranslations();
      rebuildAfterLanguageChange();
      document.body.classList.remove("lang-swapping");
      document.dispatchEvent(new CustomEvent("langchange", { detail: lang }));
    }, 180);
  }));
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

  makeAboutScrub(aboutWords);

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

  if (!reduceMotion) {
    // Section titles: each word rises out of its own mask, 50ms apart
    $$(".title").forEach((title) => {
      gsap.from(splitMaskWords(title), {
        yPercent: 105, duration: 1, stagger: 0.05, ease: "power4.out",
        scrollTrigger: { trigger: title, start: "top 85%", once: true },
      });
    });

    // Content: elements entering together are batched and staggered 60ms apart;
    // a light blur bridges the fade so it reads as one smooth motion
    // (The low tier skips the blur: animating it is costly on weak graphics hardware)
    const blur = quality !== "low";
    gsap.set(".reveal-up", { opacity: 0, y: 24, ...(blur && { filter: "blur(6px)" }) });
    ScrollTrigger.batch(".reveal-up", {
      start: "top 88%", once: true,
      onEnter: (els) => gsap.to(els, {
        opacity: 1, y: 0, ...(blur && { filter: "blur(0px)" }), duration: 0.9, stagger: 0.06, ease: "power4.out",
        clearProps: "filter",
      }),
    });
  }

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

/* ---------- Intro ----------
   First visit: a drop of water creates the site (waterIntro in intro.js). Later visits get a
   short reveal; reduced motion gets a plain fade. */
function intro(chars, fitName) {
  const overlay = $(".intro");
  const root = document.documentElement;
  const finish = () => {
    watchFrameRate();
    overlay.remove();
    root.classList.remove("intro-active");
    document.body.classList.remove("loading");
    window.scrollTo(0, 0);
    if (lenis) { lenis.scrollTo(0, { immediate: true, force: true }); lenis.start(); }
    if (hasGSAP) ScrollTrigger.refresh();
    try { localStorage.setItem("introPlayed", "1"); } catch {}
    setTimeout(showConsent, reduceMotion ? 0 : 700);
  };
  if (!hasGSAP) { finish(); return; }
  lenis && lenis.stop();

  const revealUI = () => {
    gsap.fromTo(".nav", { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out" });
    gsap.fromTo(".hero-fade", { y: 20, opacity: 0, filter: "blur(6px)" }, {
      y: 0, opacity: 1, filter: "blur(0px)", duration: 0.9, stagger: 0.08, ease: "power4.out", clearProps: "filter",
    });
  };
  const quickReveal = () => gsap.timeline()
    .to(overlay, { opacity: 0, duration: 0.45, ease: "power2.out" })
    .from(chars, { yPercent: 60, opacity: 0, filter: "blur(8px)", duration: 1, stagger: 0.035, ease: "power4.out", clearProps: "filter" }, 0.1)
    .add(revealUI, 0.15)
    .add(finish, 0.6);

  // Reduced motion: a simple fade, no drop or movement
  if (reduceMotion) { gsap.to(overlay, { opacity: 0, duration: 0.3, onComplete: finish }); return; }

  // The drop plays once per visitor; later visits get the short reveal (add ?intro to the address to see it again).
  // The low tier gets the short reveal too, as does a visit whose scripts took so long to
  // arrive that the page was already opened by the safety net in styles.css
  let played = false;
  try { played = localStorage.getItem("introPlayed") === "1"; } catch {}
  if (new URLSearchParams(location.search).has("intro")) played = false;
  if (played || quality === "low" || bootedLate) { quickReveal(); return; }

  root.classList.add("intro-active");
  const run = typeof waterIntro === "function" ? waterIntro({ overlay, chars, fitName, onStruggle: () => setQuality("low") }) : Promise.resolve(false);
  run.then((ok) => (ok ? finish() : (root.classList.remove("intro-active"), quickReveal())));
}

/* ---------- Boot ----------
   Each feature starts on its own: if one fails (an old cached file, a browser quirk), the
   rest of the site still works, and the page always opens instead of staying blank. */
const safely = (fn, ...args) => { try { return fn(...args); } catch (e) { console.error(e); } };
const openPage = () => {
  $(".intro")?.remove();
  document.documentElement.classList.remove("intro-active");
  document.body.classList.remove("loading");
};

safely(initShader); // first: it settles the quality tier if the graphics turn out to be software-rendered
safely(applyTranslations); // before any text is split into letters/words
const nameChars = safely(() => $$(".name-line").flatMap(splitChars)) || [];
const aboutWords = safely(() => splitWords($(".about-text"))) || [];
safely(() => { $(".year").textContent = new Date().getFullYear(); });

safely(initScramble);
const fitName = safely(initNameFit);
safely(initNameWeight, nameChars);
for (const init of [initMagnetic, initMarquee, initCopyEmail, initContactForm, initNavActive, initOdometers,
  initLangSwitch, initThemeToggle]) safely(init);
safely(initPortal, nameChars);
for (const init of [initThisIsMe, initJourney, initServicesTrack, initWhyStack, initContactCurtain,
  initSectionIndex, initCV, initConsent, initAssistant]) safely(init);
if (hasGSAP) safely(initScrollAnimations, aboutWords);
try { intro(nameChars, fitName); } catch (e) { console.error(e); openPage(); }
