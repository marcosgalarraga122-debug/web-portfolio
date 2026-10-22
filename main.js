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

// Wrap each word in a clipping mask (keeps <br> line breaks) so it can rise into view
function splitMaskWords(el) {
  const inner = [];
  [...el.childNodes].forEach((node) => {
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

/* ---------- Particle portrait ----------
   Every pixel of the photo becomes a particle with its own spring. Scrolling
   assembles them from an explosion; the cursor pushes them aside like sand;
   a click sends a shockwave. Rendered with WebGL points for ~29k particles. */
function initPortrait() {
  const section = $(".portrait");
  const canvas = $(".portrait-canvas");
  const data = window.PORTRAIT;
  const gl = data && canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
  if (!gl) { section.remove(); return; } // no data or no WebGL: leave the section out entirely

  const N = data.w * data.h;
  const raw = atob(data.rgb);
  const colors = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) colors[i] = raw.charCodeAt(i) / 255;

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
      gl_FragColor=vec4(v_col,smoothstep(.5,.3,r)*u_alpha);
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
  for (let i = 0; i < N; i++) { seedA[i] = Math.random() * Math.PI * 2; seedR[i] = 0.5 + Math.random(); seedD[i] = Math.random(); }

  const dpr = Math.min(devicePixelRatio, 2);
  let W = 0, H = 0, cell = 1, first = true;
  const layout = () => {
    W = canvas.width = Math.floor(canvas.clientWidth * dpr);
    H = canvas.height = Math.floor(canvas.clientHeight * dpr);
    gl.viewport(0, 0, W, H);
    const wide = canvas.clientWidth >= 900;
    const S = wide ? Math.min(H * 0.82, W * 0.5) : Math.min(W * 0.92, H * 0.55);
    const cx = wide ? W * 0.68 : W / 2, cy = wide ? H / 2 : H * 0.64;
    cell = S / data.w;
    const far = Math.max(W, H);
    for (let i = 0; i < N; i++) {
      const gx = i % data.w, gy = (i / data.w) | 0;
      const hx = cx - S / 2 + (gx + 0.5) * cell, hy = cy - S / 2 + (gy + 0.5) * cell;
      home[i * 2] = hx; home[i * 2 + 1] = hy;
      scatter[i * 2] = hx + Math.cos(seedA[i]) * seedR[i] * far;
      scatter[i * 2 + 1] = hy + Math.sin(seedA[i]) * seedR[i] * far;
      // Assemble from the centre outwards, with a little randomness
      delay[i] = 0.42 * Math.hypot(hx - cx, hy - cy) / (S * 0.71) + seedD[i] * 0.08;
    }
    if (first) { pos.set(scatter); first = false; }
  };
  layout();
  addEventListener("resize", layout);

  // Scroll progress: 0 = exploded, 1 = fully assembled
  let progress = hasGSAP && !reduceMotion ? 0 : 1;
  if (hasGSAP && !reduceMotion) {
    ScrollTrigger.create({ trigger: section, start: "top top", end: "+=100%", pin: true });
    ScrollTrigger.create({
      trigger: section, start: "top 70%", end: () => `+=${innerHeight * 1.4}`,
      onUpdate: (self) => (progress = self.progress),
    });
  }

  // Cursor repels nearby particles; a click (or tap) sends a shockwave
  const mouse = { x: 0, y: 0, active: false };
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
  };
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    [mouse.x, mouse.y] = local(e);
    mouse.active = true;
  });
  canvas.addEventListener("pointerleave", () => (mouse.active = false));
  canvas.addEventListener("pointerdown", (e) => {
    const [x, y] = local(e);
    const R = 420 * dpr;
    for (let i = 0; i < N; i++) {
      const dx = pos[i * 2] - x, dy = pos[i * 2 + 1] - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const f = (1 - d / R) * 36 * dpr;
      vel[i * 2] += (dx / d) * f;
      vel[i * 2 + 1] += (dy / d) * f;
    }
  });

  const frame = () => {
    if (!visible) { running = false; return; }
    const pA = Math.min(1, progress / 0.8);
    const R = 95 * dpr, R2 = R * R, push = 4.5 * dpr;
    for (let i = 0; i < N; i++) {
      const ix = i * 2, iy = ix + 1;
      let l = (pA - delay[i]) / 0.5;
      l = l < 0 ? 0 : l > 1 ? 1 : l;
      const e = 1 - (1 - l) * (1 - l) * (1 - l);
      const tx = scatter[ix] + (home[ix] - scatter[ix]) * e;
      const ty = scatter[iy] + (home[iy] - scatter[iy]) * e;
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
      vel[ix] = vx; vel[iy] = vy;
      pos[ix] += vx; pos[iy] += vy;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.uniform2f(uRes, W, H);
    gl.uniform1f(uSize, Math.max(1.5, cell * 0.95));
    gl.uniform1f(uAlpha, Math.min(1, progress * 4));
    gl.drawArrays(gl.POINTS, 0, N);
    requestAnimationFrame(frame);
  };

  let visible = false, running = false;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !running) { running = true; requestAnimationFrame(frame); }
  }).observe(section);
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
    const label = $(".btn-label", form);
    swapText(label, "Opening your email…");
    swapText(note, "Your email app should open now — just press send.");
    setTimeout(() => swapText(label, "Send enquiry"), 3000);
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
      swapText(state, "Copied ✓", () => state.classList.add("done"));
      clearTimeout(state.timer);
      state.timer = setTimeout(() => swapText(state, "Copy", () => state.classList.remove("done")), 2000);
    } catch {
      location.href = `mailto:${btn.dataset.email}`;
    }
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
initNavActive();
initPortrait();
if (hasGSAP) initScrollAnimations(aboutWords);
intro(nameChars);
