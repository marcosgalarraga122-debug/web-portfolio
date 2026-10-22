const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const hasGSAP = !!(window.gsap && window.ScrollTrigger);
if (hasGSAP) gsap.registerPlugin(ScrollTrigger);
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
    el.textContent = text.replace("{n}", new Intl.NumberFormat(lang).format(portraitGrid() ** 2));
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

// Phones and machines with fewer than 8 cores get every second pixel (a quarter of the particles)
const PORTRAIT_STEP = matchMedia("(max-width: 899px)").matches || (navigator.hardwareConcurrency || 8) < 8 ? 2 : 1;
const portraitGrid = () => (window.PORTRAIT ? Math.ceil(window.PORTRAIT.w / PORTRAIT_STEP) : 0);

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
      vec3 base=vec3(.051,.067,.09);                                  // midnight ink
      vec3 col=mix(base,vec3(.095,.125,.18),clamp(f*f*1.6,0.,1.));    // slate-blue clouds
      col=mix(col,vec3(.4,.32,.19),clamp(length(q)*f*.4-.2,0.,1.)*.6); // faint brass light
      col=mix(col,vec3(.5,.41,.26),exp(-d*3.5)*.12);                  // warm glow at the cursor
      col=mix(base,col,smoothstep(1.25,.15,length(uv-vec2(.6,.55))*1.5));
      col+=vec3(.045,.036,.02)*ring;
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

/* ---------- Particle portrait ----------
   Every pixel of the photo becomes a particle with its own spring. Scrolling
   assembles them from an explosion; the cursor pushes them aside like sand;
   a click sends a shockwave. Rendered with WebGL points (up to ~200k particles);
   once everything has settled the simulation sleeps until something changes. */
function initPortrait() {
  const section = $(".portrait");
  const canvas = $(".portrait-canvas");
  const data = window.PORTRAIT;
  const gl = data && canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
  if (!gl) { section.remove(); return; } // no data or no WebGL: leave the section out entirely
  // Draw on a full-screen layer outside the (pinned) section, so particles are never
  // clipped by section edges — they only vanish when they fly off the screen
  document.body.append(canvas);

  const G = portraitGrid(); // particles per side
  const N = G * G;
  const raw = atob(data.rgb);
  const colors = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const sx = Math.min(data.w - 1, (i % G) * PORTRAIT_STEP);
    const sy = Math.min(data.h - 1, ((i / G) | 0) * PORTRAIT_STEP);
    const src = (sy * data.w + sx) * 3;
    for (let k = 0; k < 3; k++) colors[i * 3 + k] = raw.charCodeAt(src + k) / 255;
  }

  const vert = `
    attribute vec2 a_pos; attribute vec3 a_col;
    uniform vec2 u_res; uniform float u_size;
    varying vec3 v_col;
    void main(){
      vec2 c=a_pos/u_res*2.-1.;
      gl_Position=vec4(c.x,-c.y,0.,1.);
      gl_PointSize=u_size;
      v_col=a_col;
    }`;
  const frag = `
    precision mediump float;
    varying vec3 v_col; uniform float u_alpha;
    void main(){
      float r=length(gl_PointCoord-.5);
      if(r>.5) discard;
      vec3 c=v_col;
      float l=dot(c,vec3(.299,.587,.114));
      c=mix(vec3(l),c,1.15);       // a touch of extra saturation, kept understated
      c=(c-.5)*1.05+.5+.02;        // slight contrast and lift so it reads on the dark background
      gl_FragColor=vec4(clamp(c,0.,1.),smoothstep(.5,.3,r)*u_alpha);
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
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const colBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  const aCol = gl.getAttribLocation(prog, "a_col");
  gl.enableVertexAttribArray(aCol);
  gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);

  const pos = new Float32Array(N * 2);
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uSize = gl.getUniformLocation(prog, "u_size");
  const uAlpha = gl.getUniformLocation(prog, "u_alpha");

  // Per-particle state; random seeds are fixed so a resize doesn't reshuffle the explosion
  const home = new Float32Array(N * 2), scatter = new Float32Array(N * 2);
  const vel = new Float32Array(N * 2), delay = new Float32Array(N);
  const seedA = new Float32Array(N), seedR = new Float32Array(N), seedD = new Float32Array(N);
  for (let i = 0; i < N; i++) { seedA[i] = Math.random() * Math.PI * 2; seedR[i] = 1.05 + Math.random() * 0.8; seedD[i] = Math.random(); }

  const dpr = Math.min(devicePixelRatio, 2);
  let W = 0, H = 0, cell = 1, first = true;
  let idle = false, lastProgress = -1, lastOffset = NaN, lastShift = NaN; // simulation sleeps once particles settle
  let homeCx = 0, homeCy = 0;
  const layout = () => {
    W = canvas.width = Math.floor(canvas.clientWidth * dpr);
    H = canvas.height = Math.floor(canvas.clientHeight * dpr);
    gl.viewport(0, 0, W, H);
    const wide = canvas.clientWidth >= 900;
    const S = wide ? Math.min(H * 0.82, W * 0.5) : Math.min(W * 0.92, H * 0.55);
    const cx = wide ? W * 0.68 : W / 2, cy = wide ? H / 2 : H * 0.64;
    homeCx = cx; homeCy = cy;
    cell = S / G;
    const far = Math.hypot(W, H); // scattered particles start fully off-screen
    for (let i = 0; i < N; i++) {
      const gx = i % G, gy = (i / G) | 0;
      const hx = cx - S / 2 + (gx + 0.5) * cell, hy = cy - S / 2 + (gy + 0.5) * cell;
      home[i * 2] = hx; home[i * 2 + 1] = hy;
      scatter[i * 2] = hx + Math.cos(seedA[i]) * seedR[i] * far;
      scatter[i * 2 + 1] = hy + Math.sin(seedA[i]) * seedR[i] * far;
      // Assemble from the centre outwards, with a little randomness
      delay[i] = 0.42 * Math.hypot(hx - cx, hy - cy) / (S * 0.71) + seedD[i] * 0.08;
    }
    if (first) { pos.set(scatter); first = false; }
    idle = false;
  };
  layout();
  addEventListener("resize", layout);

  // Scroll progress: 0 = exploded, 1 = fully assembled.
  // Measured in screen heights from when the section's top reaches the bottom of the screen
  // (it's underneath the hero then, seen only through the "o" — see initPortal):
  //   0 → 1    assembles while you travel through the "o", landing as the zoom ends
  //   1 → 2    holds while the section is pinned, so you can play with it
  //   2 → 2.5  explodes as you scroll on — the reverse of coming in
  let progress = hasGSAP && !reduceMotion ? 0 : 1;
  if (hasGSAP && !reduceMotion) {
    ScrollTrigger.create({ trigger: section, start: "top top", end: "+=100%", pin: true });
    const span = 2.5;
    ScrollTrigger.create({
      trigger: section, start: "top bottom", end: () => `+=${innerHeight * span}`,
      onUpdate: (self) => {
        const s = self.progress * span;
        const assemble = Math.min(1, s);
        const explode = Math.min(1, Math.max(0, (s - 2) / 0.5));
        progress = assemble * (1 - explode);
      },
    });
  }

  // Cursor gently parts nearby particles; a click (or tap) on the section sends a shockwave
  const mouse = { x: 0, y: 0, active: false };
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const r = section.getBoundingClientRect();
    mouse.active = e.clientY >= r.top && e.clientY <= r.bottom;
    mouse.x = e.clientX * dpr; mouse.y = e.clientY * dpr;
    if (mouse.active) idle = false;
  });
  document.addEventListener("pointerleave", () => (mouse.active = false));
  section.addEventListener("pointerdown", (e) => {
    const x = e.clientX * dpr, y = e.clientY * dpr;
    const R = 420 * dpr;
    for (let i = 0; i < N; i++) {
      const dx = pos[i * 2] - x, dy = pos[i * 2 + 1] - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const f = (1 - d / R) * 36 * dpr;
      vel[i * 2] += (dx / d) * f;
      vel[i * 2 + 1] += (dy / d) * f;
    }
    idle = false;
  });

  const frame = () => {
    // The picture follows the section as it scrolls in and out of view
    const top = section.getBoundingClientRect().top;
    const offset = (document.documentElement.classList.contains("portal-on") ? Math.min(0, top) : top) * dpr;
    // Static (reduced-motion) picture: just stop and clear once the section is far away
    if (!visible && (reduceMotion || !hasGSAP)) { running = false; gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    // Sleep while nothing moves: the canvas keeps showing the last frame. Scrolling only
    // matters while the picture is (partly) assembled — once fully exploded every particle
    // is off-screen, so there's nothing to recompute (this was costing ~130k updates per
    // scroll frame while reading the About section and stats)
    // While travelling through the "o" (at the centre of the screen), keep the picture centred
    // inside it, then let it slide to its final place as the zoom completes
    const portal = document.documentElement.classList.contains("portal-on") && portalT < 1 ? 1 - easeInOutCubic(portalT) : 0;
    const shiftX = (W / 2 - homeCx) * portal, shiftY = (H / 2 - homeCy) * portal;
    const exploded = progress === 0 && lastProgress === 0;
    if (progress !== lastProgress || shiftX !== lastShift || (offset !== lastOffset && !exploded)) idle = false;
    if (idle) {
      if (!visible && exploded) { running = false; gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return; }
      requestAnimationFrame(frame);
      return;
    }
    lastProgress = progress; lastOffset = offset; lastShift = shiftX;
    let energy = 0;
    const pA = progress;
    const R = 38 * dpr, R2 = R * R, push = 2.2 * dpr;
    for (let i = 0; i < N; i++) {
      const ix = i * 2, iy = ix + 1;
      let l = (pA - delay[i]) / 0.5;
      l = l < 0 ? 0 : l > 1 ? 1 : l;
      const e = 1 - (1 - l) * (1 - l) * (1 - l);
      const tx = scatter[ix] + (home[ix] - scatter[ix]) * e + shiftX;
      const ty = scatter[iy] + (home[iy] - scatter[iy]) * e + offset + shiftY;
      let vx = vel[ix] + (tx - pos[ix]) * 0.09;
      let vy = vel[iy] + (ty - pos[iy]) * 0.09;
      if (mouse.active) {
        const dx = pos[ix] - mouse.x, dy = pos[iy] - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R) * push;
          vx += (dx / d) * f; vy += (dy / d) * f;
        }
      }
      vx *= 0.8; vy *= 0.8;
      energy += vx * vx + vy * vy;
      vel[ix] = vx; vel[iy] = vy;
      pos[ix] += vx; pos[iy] += vy;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.uniform2f(uRes, W, H);
    gl.uniform1f(uSize, Math.max(1.5, cell * 1.02));
    gl.uniform1f(uAlpha, 1);
    gl.drawArrays(gl.POINTS, 0, N);
    if (energy / N < 1e-4) idle = true;
    requestAnimationFrame(frame);
  };

  // Run while the section is near the viewport. When it moves away, the loop only stops
  // (and clears the layer) once every particle has settled off-screen — never mid-flight,
  // which is what used to make particles vanish as the stats scrolled into view
  let visible = false, running = false;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !running) { running = true; idle = false; requestAnimationFrame(frame); }
  }, { rootMargin: "150% 0px 150% 0px" }).observe(section);
}

/* ---------- Portal: scrolling travels into the "o" of Marcos ----------
   The hero is pinned for 1.6 screens of scroll. Over that distance the camera dollies into
   the "o" (exponential scale, so the speed feels constant) while the "o" glides to the centre
   of the screen. A soft-edged mask opens in the hero exactly where the letter's counter (its
   hole) is, so through it you see the next section — the particle portrait — which sits
   underneath the hero, assembling as you approach and landing just as the zoom completes.
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
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    if (ink(px, py)) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  }
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
  const world = () => $(".portrait-canvas");      // particle layer (moved to <body> by initPortrait)
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
      el.style.filter = t > 0 ? `blur(${8 * ui}px)` : "";
    }
    heroCanvas.style.transformOrigin = `${m.cx + dx}px ${m.cy + dy}px`;
    heroCanvas.style.transform = t > 0 ? `scale(${1 + 0.35 * t})` : "";

    // The world inside the "o" approaches: it grows towards full size as you pass through
    const w = world();
    if (w) {
      w.style.transformOrigin = "50% 50%";
      w.style.transform = t > 0 && t < 1 ? `scale(${0.78 + 0.22 * easeInOutCubic(t)})` : "";
    }
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
  setInterval(() => {
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
  addEventListener("pointermove", (e) => {
    // Paused only once the zoom into the "o" is really under way (smooth scrolling can
    // leave the page a fraction of a pixel from the top, which used to switch it off)
    if (scrollY > innerHeight || portalT > PORTAL_HOVER_LIMIT) return;
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
    gsap.set(".reveal-up", { opacity: 0, y: 24, filter: "blur(6px)" });
    ScrollTrigger.batch(".reveal-up", {
      start: "top 88%", once: true,
      onEnter: (els) => gsap.to(els, {
        opacity: 1, y: 0, filter: "blur(0px)", duration: 0.9, stagger: 0.06, ease: "power4.out",
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

/* ---------- Intro: the site is "born" ----------
   First visit of a session: particles drift in from a dark void and assemble into the
   exact shape of the name. An iris then opens from the centre of the name; as it passes
   each particle, that particle fades and hands over to the real letter underneath, and
   the rest of the site settles in around it. Later visits get a short reveal instead. */
const easeInOutQuart = (u) => (u < 0.5 ? 8 * u ** 4 : 1 - (-2 * u + 2) ** 4 / 2);

function birth(overlay, chars, fitName, revealUI) {
  return new Promise(async (resolve) => {
    const canvas = $(".intro-canvas", overlay);
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(devicePixelRatio, 2);
    const W = (canvas.width = Math.floor(innerWidth * dpr));
    const H = (canvas.height = Math.floor(innerHeight * dpr));

    // Wait briefly for the name's font so the particles match the real letters exactly
    await Promise.race([
      Promise.all([document.fonts.load('600 100px "Fraunces"'), document.fonts.load('italic 600 100px "Fraunces"')]),
      new Promise((r) => setTimeout(r, 1200)),
    ]).catch(() => {});
    fitName();

    // Draw each letter off-screen at the position of the real one, then sample the shapes
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const o = off.getContext("2d", { willReadFrequently: true });
    o.fillStyle = "#fff";
    o.textBaseline = "middle";
    let x0 = W, y0 = H, x1 = 0, y1 = 0, fontPx = 40;
    chars.forEach((c) => {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      fontPx = parseFloat(cs.fontSize) * dpr;
      o.font = `${cs.fontStyle} ${cs.fontWeight} ${fontPx}px Fraunces, Georgia, serif`;
      o.fillText(c.textContent, r.left * dpr, (r.top + r.height / 2) * dpr);
      x0 = Math.min(x0, r.left * dpr); x1 = Math.max(x1, r.right * dpr);
      y0 = Math.min(y0, r.top * dpr); y1 = Math.max(y1, r.bottom * dpr);
    });
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    const step = Math.max(2, Math.round(fontPx / 42));
    let pts = [];
    if (x1 > x0 && y1 > y0) {
      const bw = x1 - x0;
      const img = o.getImageData(x0, y0, bw, y1 - y0).data;
      for (let y = 0; y < y1 - y0; y += step) {
        for (let x = 0; x < bw; x += step) if (img[(y * bw + x) * 4 + 3] > 128) pts.push(x0 + x, y0 + y);
      }
    }
    if (pts.length < 80) { resolve(false); return; } // couldn't draw the name: use the simple reveal

    // Keep it light: at most ~4500 particles
    const keep = Math.min(1, 4500 / (pts.length / 2));
    const tx = [], ty = [];
    for (let i = 0; i < pts.length; i += 2) if (Math.random() < keep) { tx.push(pts[i]); ty.push(pts[i + 1]); }
    const n = tx.length;
    const px = new Float32Array(n), py = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n);
    const delay = new Float32Array(n), alpha = new Float32Array(n), tone = new Uint8Array(n), gone = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = Math.random() * W; py[i] = Math.random() * H;  // a faint field of dust across the screen
      delay[i] = Math.random() * 450;
      const r = Math.random();
      tone[i] = r < 0.82 ? 0 : r < 0.94 ? 1 : 2;              // mostly off-white, a few warm sparks
    }
    const tones = ["rgb(236,230,218)", "rgb(201,166,107)", "rgb(226,201,152)"]; // ivory, brass, pale brass
    const size = Math.max(1.5 * dpr, step * 0.8);

    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;            // iris opens from the centre of the name
    const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    const T_REVEAL = 1650, T_IRIS = 1000;
    let heroAnim = null, uiShown = false;
    const start = performance.now();
    setTimeout(() => overlay.classList.add("show-status"), 200);

    const frame = (now) => {
      const t = now - start;
      const iris = t > T_REVEAL ? easeInOutQuart(Math.min(1, (t - T_REVEAL) / T_IRIS)) * maxR : -1;
      const hold = t > 1250 && t < T_REVEAL;

      if (t > T_REVEAL - 250) overlay.classList.remove("show-status");
      if (t > T_REVEAL && !heroAnim) {
        // The page appears: the dark void clears and the hero opens like an iris
        overlay.classList.add("clear");
        const c = `${cx / dpr}px ${cy / dpr}px`;
        heroAnim = $(".hero").animate(
          [{ clipPath: `circle(0px at ${c})` }, { clipPath: `circle(${maxR / dpr}px at ${c})` }],
          { duration: T_IRIS, easing: "cubic-bezier(.77, 0, .175, 1)", fill: "forwards" }
        );
      }
      if (t > T_REVEAL + 420 && !uiShown) { uiShown = true; revealUI(); }

      ctx.clearRect(0, 0, W, H);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = tones[k];
        for (let i = 0; i < n; i++) {
          if (tone[i] !== k || gone[i]) continue;
          if (t > delay[i]) {
            // Spring towards the letter, with a slight swirl while still far away
            const dx = tx[i] - px[i], dy = ty[i] - py[i];
            vx[i] = (vx[i] + dx * 0.07 - dy * 0.004) * 0.8;
            vy[i] = (vy[i] + dy * 0.07 + dx * 0.004) * 0.8;
            px[i] += vx[i]; py[i] += vy[i];
            alpha[i] = Math.min(1, alpha[i] + 0.05);
          } else {
            alpha[i] = Math.min(0.25, alpha[i] + 0.01);     // dust, before it's called
          }
          let x = px[i], y = py[i];
          if (hold) { x += (Math.random() - 0.5) * 0.6 * dpr; y += (Math.random() - 0.5) * 0.6 * dpr; }
          // Once the iris passes a particle it fades out and the real letter takes over
          if (iris > 0 && Math.hypot(x - cx, y - cy) < iris) {
            alpha[i] -= 0.12;
            if (alpha[i] <= 0) { gone[i] = 1; continue; }
          }
          ctx.globalAlpha = alpha[i];
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;

      if (t < T_REVEAL + T_IRIS + 80) { requestAnimationFrame(frame); return; }
      document.documentElement.classList.remove("intro-active");
      heroAnim?.cancel();
      resolve(true);
    };
    requestAnimationFrame(frame);
  });
}

function intro(chars, fitName) {
  const overlay = $(".intro");
  const root = document.documentElement;
  const finish = () => {
    overlay.remove();
    root.classList.remove("intro-active");
    document.body.classList.remove("loading");
    window.scrollTo(0, 0);
    if (lenis) { lenis.scrollTo(0, { immediate: true, force: true }); lenis.start(); }
    if (hasGSAP) ScrollTrigger.refresh();
    try { sessionStorage.setItem("introPlayed", "1"); } catch {}
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

  // Reduced motion: a simple fade, no particles or movement
  if (reduceMotion) { gsap.to(overlay, { opacity: 0, duration: 0.3, onComplete: finish }); return; }

  let played = false;
  try { played = sessionStorage.getItem("introPlayed") === "1"; } catch {}
  if (played) { quickReveal(); return; }

  root.classList.add("intro-active");
  birth(overlay, chars, fitName, revealUI).then((ok) => {
    if (ok) { finish(); return; }
    root.classList.remove("intro-active");
    quickReveal();
  });
}

/* ---------- Boot ---------- */
applyTranslations(); // before any text is split into letters/words
const nameChars = $$(".name-line").flatMap(splitChars);
const aboutWords = splitWords($(".about-text"));
$(".year").textContent = new Date().getFullYear();

initShader();
initScramble();
const fitName = initNameFit();
initNameWeight(nameChars);
initMagnetic();
initMarquee();
initCopyEmail();
initContactForm();
initNavActive();
initOdometers();
initLangSwitch();
initPortal(nameChars);
initPortrait();
if (hasGSAP) initScrollAnimations(aboutWords);
intro(nameChars, fitName);
