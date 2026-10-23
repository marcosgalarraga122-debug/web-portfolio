/* ---------- Intro: a drop of water creates the site ----------
   Plays once per visitor (intro() in main.js decides when). A single WebGL fragment shader
   ray-traces a small scene in the site's own palette while the real page waits under water:

   1. A drop hangs above a still, dark surface, seen from the side and lit like a studio shot.
   2. It falls; the camera cranes up and tilts until it looks straight down as the drop strikes.
   3. The impact raises a small crown, the cavity beneath it collapses into a rebound jet, and
      trains of ripples spread out, breaking up the reflections of the studio lights.
   4. Wherever the waves have passed, the water clears: the page comes into focus (layered
      backdrop blurs), every element is refracted by the passing ripples (CSS transforms on the
      real HTML), light catches the page in caustics, and the camera settles at exactly the
      page's scale. The ripples die away and the overlay leaves nothing but the normal page.

   World units are CSS pixels of the final view, so the water and the page line up exactly.
   waterIntro() resolves true when it has played, false if it couldn't run (no WebGL, shader
   error), in which case main.js falls back to its short reveal. */

const WATER_T = { fall: 900, impact: 1900, settle: 3600, fade: 3350, end: 4250 }; // ms
const WATER_NP = 2;  // ripple trains: the impact, and the crown falling back
const WATER_LAG = 380; // the water clears this long after the wave has passed

const v3 = {
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  glsl: (a) => `vec3(${a.map((x) => x.toFixed(5)).join(",")})`,
};
// A rectangular studio light: its direction plus two axes spanning its face
const waterLight = (dir, upHint) => {
  const c = v3.norm(dir), r = v3.norm(v3.cross(upHint, c));
  return { c, r, u: v3.cross(c, r) };
};
const WATER_KEY = waterLight([-0.55, 0.62, 0.56], [0, 1, 0]);   // window above-left of the first shot

const WATER_VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const WATER_FRAG = `
precision highp float;
#define NP ${WATER_NP}
uniform vec2 uRes;       // drawing buffer size
uniform float uPx;       // drawing-buffer pixels per CSS pixel
uniform vec2 uC;         // where the impact point sits on screen (CSS px)
uniform float uF;        // focal length (CSS px)
uniform vec3 uCam, uFwd, uUp;
uniform float uT, uRd;   // time (ms), drop radius
uniform vec4 uDrop;      // drop centre, visible
uniform vec2 uDropAx;    // horizontal, vertical semi-axes
uniform vec4 uPk[NP];    // ripple trains: centre x, z, front radius, amplitude
uniform vec4 uPq[NP];    //                wavenumber, tail width, front width, phase
uniform vec4 uCrown;     // crown radius, height, width; cavity depth
uniform vec2 uJet;       // jet height, width
uniform vec4 uRev;       // clear-water radius, band width, effects fade, final clear
uniform float uCalm;     // 0 while the splash is busy, 1 once it has settled
uniform float uExpo, uAmb, uVig, uSplash;
uniform vec3 uMurk;      // the water body, in display colour (= the page background)
uniform vec3 uSkyTop, uSkyHor, uGlow, uKey, uStrip, uFill, uDeep, uCau, uSheet;
uniform vec3 uLook;      // light theme: lights become dark flags (glow, strips), slope shading

const vec3 KC = ${v3.glsl(WATER_KEY.c)}, KR = ${v3.glsl(WATER_KEY.r)}, KU = ${v3.glsl(WATER_KEY.u)};

float fres(float c) { float m = 1. - c; float m2 = m * m; return .02 + .98 * m2 * m2 * m; } // water, n = 1.333

float light(vec3 d, vec3 c, vec3 r, vec3 u, vec2 hs, float s) {
  float k = dot(d, c);
  if (k <= .05) return 0.;
  vec2 q = abs(vec2(dot(d, r), dot(d, u)) / k);
  vec2 e = smoothstep(hs + s, hs - s, q);
  return e.x * e.y;
}

// A strip light arching from the far horizon up and over, turned by angle a about the vertical
float strip(vec3 d, float a) {
  float c = cos(a), s = sin(a);
  float x = (d.x * c - d.z * s) / .16, z = d.x * s + d.z * c;
  return exp(-x * x * 2.) * smoothstep(.3, .45, d.y) * smoothstep(.5, .2, z);
}

// The studio around the water: walls in the page colour, a thin line of warm light on the
// horizon behind the drop, a soft window for the drop's highlight, and a long strip light
// curving overhead from the horizon, which the water reflects as the camera rises
vec3 sky(vec3 d) {
  float y = d.y;
  vec3 col = mix(uSkyHor, uSkyTop, smoothstep(0., .35, y));
  float az = atan(d.x, -d.z);
  float gy = (y - .006) / .009;
  // On the dark set these are lights; on the light set they are dark flags (uLook.x/y > 0)
  float gm = exp(-az * az * 3. - gy * gy) * 1.6 + .03 * exp(-az * az * 1.2 - y * y * 900.);
  col = col * (1. - min(gm, 1.) * uLook.x) + uGlow * gm;
  col += uKey * light(d, KC, KR, KU, vec2(.30, .19), .05);
  // two long strips arching overhead: what the ripples catch as they pass
  float sm = strip(d, 0.) + .4 * strip(d, 1.05);
  col = col * (1. - min(sm, 1.) * uLook.y) + uStrip * sm;
  // a soft fill low behind the first camera: it lights the near walls of the splash
  col += uFill * exp(-pow((y - .08) / .14, 2.)) * smoothstep(-.2, .6, d.z);
  return col;
}
vec3 env(vec3 d) {
  if (d.y >= 0.) return sky(d);
  // Below the horizon: the far water, mirroring the room at grazing angles
  vec3 m = sky(vec3(d.x, -d.y, d.z));
  return mix(uDeep, m, fres(-d.y));
}

// Soft shoulder for highlights, then display gamma
vec3 tone(vec3 c) {
  vec3 x = max(c, 0.);
  x = mix(x, .8 + .2 * (1. - exp(-(x - .8) / .2)), step(.8, x));
  return pow(x, vec3(1. / 2.2));
}

// Ripple trains spreading from points on the surface: height, slope and curvature
vec4 wave(vec2 p) {
  vec4 o = vec4(0.);
  for (int i = 0; i < NP; i++) {
    vec4 a = uPk[i];
    if (a.w == 0.) continue;
    vec4 b = uPq[i];
    vec2 d = p - a.xy;
    float r = length(d) + .001;
    float xi = r - a.z;
    float s = xi < 0. ? b.y : b.z;
    float q = xi / s;
    float e = exp(-.5 * q * q);
    if (e < .002) continue;
    vec2 u = d / r;
    float org = 1. + .09 * (3. * u.y - 4. * u.y * u.y * u.y) + .06 * (u.x * u.x - u.y * u.y); // not a perfect circle
    float g = org * inversesqrt(1. + r / (8. * uRd));
    float ph = b.x * r + b.w;
    float c = cos(ph), sn = sin(ph);
    float h = a.w * g * e * c;
    float dh = a.w * g * (-q / s * e * c - e * b.x * sn);
    o += vec4(h, dh * u, -b.x * b.x * h + dh / r);
  }
  return o;
}
// Faint, slow swells: a perfectly flat mirror never looks like water
vec3 amb(vec2 p) {
  float t = uT * .001;
  vec2 d1 = vec2(.8, .6), d2 = vec2(-.44, .898), d3 = vec2(.17, -.985);
  float k1 = 6.2832 / (11. * uRd), k2 = 6.2832 / (6.3 * uRd), k3 = 6.2832 / (16. * uRd);
  float a1 = dot(p, d1) * k1 - t * 1.1, a2 = dot(p, d2) * k2 + t * 1.6, a3 = dot(p, d3) * k3 - t * .8;
  float A = uAmb * uRd;
  return A * vec3(sin(a1) + .35 * sin(a2) + .8 * sin(a3),
                  cos(a1) * k1 * d1 + .35 * cos(a2) * k2 * d2 + .8 * cos(a3) * k3 * d3);
}
// Crown, cavity and rebound jet around the impact
float crownH(vec2 p) {
  float x = (length(p) - uCrown.x) / uCrown.z;
  float an = atan(p.y, p.x);
  return uCrown.y * exp(-x * x) * (1. + .06 * sin(an * 11. + 1.7) + .05 * sin(an * 7. - .6) + .04 * sin(an * 17. + 2.9));
}
float jetH(vec2 p) { return uJet.x * exp(-dot(p, p) / (uJet.y * uJet.y)); }
float splashH(vec2 p) { return crownH(p) + jetH(p) - uCrown.w * exp(-dot(p, p) / (1.8 * uRd * uRd)); }

bool hitEll(vec3 ro, vec3 rd, vec3 c, vec3 ax, out float t0, out float t1) {
  vec3 o = (ro - c) / ax, d = rd / ax;
  float a = dot(d, d), b = dot(o, d), k = dot(o, o) - 1.;
  float h = b * b - a * k;
  if (h < 0.) return false;
  h = sqrt(h);
  t0 = (-b - h) / a; t1 = (-b + h) / a;
  return t1 > 0.;
}
vec3 nEll(vec3 p, vec3 c, vec3 ax) { return normalize((p - c) / (ax * ax)); }

// Light leaving a drop through its far side, after refraction (and one internal bounce at most)
vec3 through(vec3 p, vec3 t1, vec3 c, vec3 ax, float eta) {
  float a0, a1;
  hitEll(p + t1 * .002, t1, c, ax, a0, a1);
  vec3 p2 = p + t1 * a1;
  vec3 n2 = nEll(p2, c, ax);
  vec3 t2 = refract(t1, -n2, eta);
  if (dot(t2, t2) < .5) {
    vec3 tb = reflect(t1, -n2);
    hitEll(p2 + tb * .002, tb, c, ax, a0, a1);
    vec3 p3 = p2 + tb * a1;
    vec3 n3 = nEll(p3, c, ax);
    t2 = refract(tb, -n3, eta);
    if (dot(t2, t2) < .5) t2 = reflect(tb, -n3);
  }
  return t2;
}
// A drop of water: Fresnel reflection plus the room seen through it, upside down.
// The hero drop splits red, green and blue very slightly, as real water does.
vec3 dropCol(vec3 ro, vec3 rd, float t, vec3 c, vec3 ax, bool disperse) {
  vec3 p = ro + rd * t;
  vec3 n = nEll(p, c, ax);
  float F = fres(clamp(dot(-rd, n), 0., 1.));
  vec3 col = env(reflect(rd, n)) * F;
  vec3 tr;
  if (disperse) {
    tr.r = env(through(p, refract(rd, n, 1. / 1.329), c, ax, 1.329)).r;
    tr.g = env(through(p, refract(rd, n, 1. / 1.333), c, ax, 1.333)).g;
    tr.b = env(through(p, refract(rd, n, 1. / 1.340), c, ax, 1.340)).b;
  } else {
    tr = env(through(p, refract(rd, n, 1. / 1.333), c, ax, 1.333));
  }
  return col + tr * (1. - F) * vec3(.94, .98, .96);
}

// Ray-march the splash shapes (inside a cylinder around the impact); the ripples are
// shading only, everywhere, so the two meet without a seam
bool marchSplash(vec3 ro, vec3 rd, out vec3 hit) {
  float Rb = 4.8 * uRd, y0 = -1.9 * uRd, y1 = 3.4 * uRd;
  if (abs(rd.y) < 1e-4) return false;
  float ta = (y1 - ro.y) / rd.y, tb = (y0 - ro.y) / rd.y;
  float tmin = min(ta, tb), tmax = max(ta, tb);
  float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz), k = dot(ro.xz, ro.xz) - Rb * Rb;
  float disc = b * b - a * k;
  if (disc < 0. || a < 1e-8) return false;
  disc = sqrt(disc);
  tmin = max(max(tmin, (-b - disc) / a), 0.);
  tmax = min(tmax, (-b + disc) / a);
  if (tmin >= tmax) return false;
  float dt = (tmax - tmin) / 40.;
  float tp = tmin;
  for (int i = 1; i <= 40; i++) {
    float t = tmin + dt * float(i);
    vec3 p = ro + rd * t;
    if (p.y < splashH(p.xz)) {
      float lo = tp, hi = t;
      for (int j = 0; j < 6; j++) {
        float m = .5 * (lo + hi);
        vec3 q = ro + rd * m;
        if (q.y < splashH(q.xz)) hi = m; else lo = m;
      }
      hit = ro + rd * hi;
      return true;
    }
    tp = t;
  }
  return false;
}

// The water surface: reflection on top, the page (or the dark water) underneath. Thin, raised
// water (the crown, the jet) also lets the bright far side of the room shine through it.
vec4 water(vec3 p, vec3 n, vec3 rd, vec4 wv, float sheet) {
  float F0 = fres(clamp(dot(-rd, n), 0., 1.)) * (1. - uRev.z);
  vec3 rr = reflect(rd, n);
  rr.y = abs(rr.y);
  vec3 L;
  float t0, t1;
  vec3 dax = vec3(uDropAx.x, uDropAx.y, uDropAx.x);
  if (uDrop.w > 0. && uSplash == 0. && hitEll(p, rr, uDrop.xyz, dax, t0, t1) && t0 > 0.) L = dropCol(p, rr, t0, uDrop.xyz, dax, false);
  else L = env(rr);
  // The water clears behind the wave; crests carry the edge forward a little
  float r = length(p.xz) - 5. * wv.x;
  float clear = smoothstep(uRev.x + .5 * uRev.y, uRev.x - .5 * uRev.y, r);
  clear *= mix(smoothstep(3.5 * uRd, 6.5 * uRd, length(p.xz)), 1., uCalm);   // not through the busy splash
  clear = max(clear, uRev.w);
  // Where the page shows through, its own light outshines the reflections
  float F = F0 * mix(1., .04, clear);
  vec3 R = tone(L * F);   // reflected light: Fresnel first, then the tone curve
  // Ripples focus light onto the page beneath
  float cau = pow(clamp(-wv.w * uRd * 5., 0., 1.), 1.6) * 1.6 * clear * (1. - uRev.z);
  // The water body is faintly shaded by its slopes, so ripples read even from straight above
  vec3 murk = uMurk * (1. + uLook.z * dot(n.xz, vec2(.32, -.95)));
  vec3 rgb = R + (1. - F) * (1. - clear) * murk + cau * uCau * (1. - F);
  float al = F + (1. - F) * (1. - clear);
  if (sheet > 0.) {
    rgb = mix(rgb, R + (1. - F) * uSheet, sheet * .7);
    al = mix(al, 1., sheet);
  }
  al = max(al, max(rgb.r, max(rgb.g, rgb.b)));
  return vec4(rgb, min(al, 1.));
}

vec4 trace(vec3 ro, vec3 rd) {
  vec3 dax = vec3(uDropAx.x, uDropAx.y, uDropAx.x);
  float t0, t1;
  float tD = 1e9;
  if (uDrop.w > 0. && hitEll(ro, rd, uDrop.xyz, dax, t0, t1) && t0 > 0.) tD = t0;
  vec3 pW = vec3(0.);
  float tW = 1e9;
  bool marched = false;
  if (uSplash > 0. && marchSplash(ro, rd, pW)) { tW = dot(pW - ro, rd); marched = true; }
  else if (rd.y < 0.) { tW = -ro.y / rd.y; pW = ro + rd * tW; }

  if (tD < tW) return vec4(tone(dropCol(ro, rd, tD, uDrop.xyz, dax, true)), 1.);
  if (tW < 1e8) {
    vec4 wv = wave(pW.xz);
    vec3 am = amb(pW.xz) * exp(-tW / (90. * uRd));
    vec2 g = wv.yz + am.yz;
    float sheet = 0.;
    if (marched) {
      // the thin rim of the crown and the tip of the jet let light through
      float ch = crownH(pW.xz) / max(uCrown.y, 1e-3);
      sheet = max(.3 * smoothstep(.15, .5, ch) + .7 * smoothstep(.6, .95, ch), smoothstep(.6, .95, jetH(pW.xz) / max(uJet.x, 1e-3)));
      float e = .08 * uRd;
      g += vec2(splashH(pW.xz + vec2(e, 0.)) - splashH(pW.xz - vec2(e, 0.)),
                splashH(pW.xz + vec2(0., e)) - splashH(pW.xz - vec2(0., e))) / (2. * e);
    }
    vec3 n = normalize(vec3(-g.x, 1., -g.y));
    return water(pW, n, rd, wv, sheet * sqrt(1. - abs(dot(rd, n))));
  }
  return vec4(tone(env(rd)), 1.);
}

vec3 ray(vec2 px) { return normalize(uFwd * uF + vec3(px.x - uC.x, 0., 0.) - uUp * (px.y - uC.y)); }

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uPx;
  vec3 rd = ray(px);
  vec4 col;
  // Supersample a thin ring around the drop's outline, so its edge stays clean
  float edge = 0.;
  if (uDrop.w > 0.) {
    vec3 dc = uDrop.xyz - uCam;
    float dl = length(dc);
    float ang = acos(clamp(dot(rd, dc / dl), -1., 1.));
    float pix = 2. / (uF * uPx);
    float rmin = asin(min(.999, min(uDropAx.x, uDropAx.y) / dl)), rmax = asin(min(.999, max(uDropAx.x, uDropAx.y) / dl));
    edge = step(rmin - pix, ang) * step(ang, rmax + pix);
  }
  if (edge > 0.) {
    float o = .3 / uPx;
    col = .25 * (trace(uCam, ray(px + vec2(-o, -o))) + trace(uCam, ray(px + vec2(o, -o)))
               + trace(uCam, ray(px + vec2(-o, o))) + trace(uCam, ray(px + vec2(o, o))));
  } else col = trace(uCam, rd);

  // Exposure rises from the page colour; a soft vignette while the scene is cinematic
  col.rgb = mix(uMurk * col.a, col.rgb, uExpo);
  vec2 q = (px - .5 * uRes / uPx) / (uRes.y / uPx);
  col.rgb *= 1. - uVig * smoothstep(.35, 1.1, length(q));
  // Dither away banding in the dark gradients
  col.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) / 255. * col.a;
  gl_FragColor = col;
}`;

function waterIntro({ overlay, chars, fitName }) {
  return new Promise(async (resolve) => {
    const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
    const params = new URLSearchParams(location.search);
    const seekMode = params.has("introSeek"), perf = params.has("introPerf");
    const canvas = q(".intro-canvas");
    const gl = canvas.getContext("webgl", {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: seekMode,
    });
    if (!gl) { resolve(false); return; }

    // Lay the page out with its real fonts first, so nothing shifts once it's revealed
    await Promise.race([
      Promise.all([document.fonts.load('600 100px "Fraunces"'), document.fonts.load('italic 600 100px "Fraunces"')]),
      new Promise((r) => setTimeout(r, 1200)),
    ]).catch(() => {});
    fitName();

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, WATER_VERT), fs = compile(gl.FRAGMENT_SHADER, WATER_FRAG);
    const prog = vs && fs && gl.createProgram();
    if (!prog) { resolve(false); return; }
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); resolve(false); return; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ["uRes", "uPx", "uC", "uF", "uCam", "uFwd", "uUp", "uT", "uRd", "uDrop", "uDropAx", "uPk", "uPq", "uCrown", "uJet", "uCalm",
      "uRev", "uExpo", "uAmb", "uVig", "uSplash", "uMurk", "uSkyTop", "uSkyHor", "uGlow", "uKey", "uStrip", "uFill", "uDeep", "uCau", "uSheet", "uLook"]
      .forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

    // ---- Palette: the scene is lit in the page's own colours ----
    const css = getComputedStyle(document.documentElement);
    const hex = (name) => { const n = parseInt(css.getPropertyValue(name).trim().slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255); };
    const lin = (c) => c.map((x) => Math.pow(x, 2.2));
    const mul = (c, k) => c.map((x) => x * k);
    const add = (a, b) => a.map((x, i) => x + b[i]);
    const light = document.documentElement.dataset.theme === "light";
    const bgD = hex("--bg"), bg = lin(bgD), acc = lin(hex("--accent")), fg = lin(hex("--fg"));
    const pal = light ? {
      uSkyTop: mul(bg, 0.92), uSkyHor: bg, uGlow: mul(acc, 0.5), uKey: [1.8, 1.77, 1.7],
      uStrip: mul(fg, 1.5), uFill: mul(bg, 0.25), uDeep: mul(bg, 0.55), uCau: [0.03, 0.025, 0.02], uSheet: [1, 0.99, 0.96],
      uLook: [0.8, 0.75, 1.1],
    } : {
      uSkyTop: mul(bg, 0.75), uSkyHor: add(mul(bg, 1.7), mul(acc, 0.002)), uGlow: add(mul(acc, 1.3), mul(fg, 0.1)),
      uKey: mul(fg, 4.5), uStrip: mul(add(mul(fg, 0.65), mul(acc, 0.35)), 5), uFill: mul(add(mul(fg, 0.5), mul(acc, 0.5)), 0.25),
      uDeep: mul(bg, 0.9), uCau: [0.07, 0.06, 0.04], uSheet: [0.62, 0.52, 0.38], uLook: [0, 0, 0.8],
    };

    // ---- Layout, measured once (and again on resize) with every transform cleared ----
    const hero = q(".hero"), nav = q(".nav");
    const targets = [...qa(".nav-logo, .nav-links a, .theme-toggle, .lang, .nav-cta, .hero-top > *, .hero-role, .hero-intro > *, .scroll-cue"), ...chars];
    const saved = { hero: hero.style.transformOrigin, nav: nav.style.transformOrigin };
    const focus = [2, 6, 14].map((b) => {
      const el = document.createElement("div");
      el.className = "intro-blur";
      el.style.setProperty("--b", `${b}px`);
      el.style.display = "none";
      document.body.append(el);
      return el;
    });
    let W, H, C, f, rd, items, keys, P, drop, reach;
    const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const hermite = (k, t) => {
      if (t <= k[0][0]) return k[0][1];
      for (let i = 1; i < k.length; i++) {
        const [t1, v1, m1] = k[i];
        if (t > t1) continue;
        const [t0, v0, m0] = k[i - 1], h = t1 - t0, x = (t - t0) / h, x2 = x * x, x3 = x2 * x;
        return (2 * x3 - 3 * x2 + 1) * v0 + (x3 - 2 * x2 + x) * h * m0 + (3 * x2 - 2 * x3) * v1 + (x3 - x2) * h * m1;
      }
      return k[k.length - 1][1];
    };

    const T = WATER_T;
    const measure = () => {
      targets.forEach((el) => (el.style.transform = ""));
      hero.style.scale = nav.style.scale = "";
      W = innerWidth; H = innerHeight;
      const nr = q(".hero-name").getBoundingClientRect();
      C = { x: nr.left + nr.width / 2, y: nr.top + nr.height / 2 };
      f = H / (2 * Math.tan((30 * Math.PI) / 360));        // 30° vertical field of view
      const m = Math.min(W, H);
      rd = (10 * m) / 800;                                  // drop radius
      reach = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - C.x, y - C.y)));
      items = targets.map((el) => {
        const r = el.getBoundingClientRect();
        return r.width || r.height ? { el, x: r.left + r.width / 2 - C.x, z: r.top + r.height / 2 - C.y } : null;
      }).filter(Boolean);
      const hr = hero.getBoundingClientRect(), vr = nav.getBoundingClientRect();
      hero.style.transformOrigin = `${C.x - hr.left}px ${C.y - hr.top}px`;
      nav.style.transformOrigin = `${C.x - vr.left}px ${C.y - vr.top}px`;

      // Camera: a close side view of the drop, craning up as it falls (about 50° at impact,
      // so the crown is seen in relief, straight down two thirds of a second later), then
      // pulling back until one world unit is exactly one CSS pixel
      const D0 = (f * rd) / (0.15 * m), D1 = f / 5;
      const lnF = Math.log(f), slope = (lnF - Math.log(D0)) / (T.settle - T.fall);
      keys = {
        elev: [[0, 1.5, 0], [T.fall - 80, 1.8, 0], [T.impact, 48, 0.075], [T.impact + 650, 90, 0]],
        dist: [[0, Math.log(D0 * 1.05), 0], [T.fall, Math.log(D0), 0], [T.impact, Math.log(D1), slope], [T.settle, lnF, 0]],
      };

      // The drop: hangs, then falls under gravity so that it touches the surface at impact
      const shape = (t) => {
        const fall = sstep(T.fall, T.impact, t);
        const k = 1 + 0.042 * Math.exp(-t / 1600) * Math.sin((2 * Math.PI * t) / 300)
          + 0.012 * fall * Math.sin((2 * Math.PI * t) / 210) + 0.025 * fall * fall;
        return [rd * k, rd / (k * k)];                       // volume stays the same
      };
      const bImp = shape(T.impact)[1], y0 = 6 * rd, fallT = T.impact - T.fall;
      const g = (2 * (y0 - bImp)) / (fallT * fallT), vImp = g * fallT;
      drop = { shape, bImp, y0, g, vImp };

      // Ripple trains. The water clears a moment after the main wave has passed, and must
      // clear the farthest corner of the screen by the time the camera settles, so the
      // wave's range is solved from the screen size.
      const ease = (x, p) => 1 - Math.pow(1 - Math.pow(x, 1.15), p);
      const lam = (Q, x) => Q.l0 + (Q.l1 - Q.l0) * Math.pow(x, 0.7);
      const main = { t0: 0, c: [0, 0], A0: 0.32 * rd, l0: 2.4 * rd, l1: 6.5 * rd, R0: 1.2 * rd, Tw: 2700, p: 2.2, gam: 1.3, decay: 2800, phi: 0 };
      const xc = Math.min(1, (T.settle - T.impact - WATER_LAG) / main.Tw);
      const need = (reach + 5 * rd) / 0.86;
      main.Rmax = main.R0 + (need - main.R0) / ease(xc, main.p);
      // The rebound jet: rises from the collapsing cavity and falls back
      const jet = { t0: 270, dur: 470, h: 2.3 * rd };
      const jetH = (tau) => { const x = (tau - jet.t0) / jet.dur; return x > 0 && x < 1 ? jet.h * Math.pow(Math.sin(Math.PI * x), 1.5) : 0; };
      const crownR = (tau) => rd * (0.95 + 1.9 * (1 - Math.exp(-tau / 150)));
      P = {
        main, ease, lam, jet, jetH, crownR,
        trains: [
          main,
          { t0: 320, c: [0, 0], A0: 0.08 * rd, l0: 1.8 * rd, l1: 4 * rd, R0: 2 * rd, Rmax: 0.8 * main.Rmax, Tw: 2500, p: 2.2, gam: 1.25, decay: 2000, phi: 1.3 },
        ],
      };
      resize();
    };
    let pxScale = Math.min(devicePixelRatio || 1, 1.25);
    const resize = () => {
      canvas.width = Math.round(W * pxScale);
      canvas.height = Math.round(H * pxScale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    // ---- Everything in the scene at time t (ms) ----
    const pk = new Float32Array(WATER_NP * 4), pq = new Float32Array(WATER_NP * 4);
    const scene = (t) => {
      const tau = t - T.impact;
      const fade = sstep(T.fade, T.end, t);
      // Camera
      const elev = (hermite(keys.elev, t) * Math.PI) / 180;
      const dist = Math.exp(hermite(keys.dist, t));
      let dy;
      if (t < T.fall) dy = drop.y0 + 0.06 * rd * (1 - Math.cos((2 * Math.PI * t) / T.fall)) * 0.5;
      else if (tau <= 0) dy = drop.y0 - 0.5 * drop.g * (t - T.fall) ** 2;
      else dy = drop.bImp - drop.vImp * tau + 0.5 * (drop.vImp / 400) * tau * tau; // slows in the water
      const target = tau < 0 ? dy : hermite([[0, drop.bImp, -drop.vImp], [380, 0, 0]], tau);
      const cam = [0, target + dist * Math.sin(elev), dist * Math.cos(elev)];
      const fwd = [0, -Math.sin(elev), -Math.cos(elev)], up = [0, Math.cos(elev), -Math.sin(elev)];
      // The drop sinks into the cavity and becomes part of the water
      let [ax, ay] = drop.shape(Math.min(t, T.impact));
      const melt = 1 - sstep(30, 170, tau);
      ax *= melt; ay *= melt;
      // Splash
      const bump = (x, p) => (x <= 0 ? 0 : (x / p) * Math.exp(1 - x / p));
      const crown = tau > 0 ? [P.crownR(tau), rd * 1.3 * bump(tau, 130), rd * 0.2 * (1 + tau / 600), rd * 1.45 * bump(tau, 160) * (1 - sstep(280, 460, tau))] : [rd, 0, rd, 0];
      const jx = (tau - P.jet.t0) / P.jet.dur;
      const jet = [P.jetH(tau), rd * (0.42 + 0.25 * Math.min(1, Math.max(0, jx)))];
      // Ripple trains
      pk.fill(0); pq.fill(0);
      P.trains.forEach((Q, i) => {
        const age = tau - Q.t0;
        if (age <= 0) return;
        const x = Math.min(1, age / Q.Tw);
        const R = Q.R0 + (Q.Rmax - Q.R0) * P.ease(x, Q.p);
        const lam = P.lam(Q, x), k = (2 * Math.PI) / lam;
        const A = Q.A0 * Math.exp(-age / Q.decay) * sstep(0, 90, age) * (1 - fade);
        pk.set([Q.c[0], Q.c[1], R, A], i * 4);
        pq.set([k, lam * (1.5 + 4 * x), lam * 0.42, -k * Q.gam * R + Q.phi], i * 4);  // a long tail of trailing crests
      });
      // The clear water follows where the main wave was a moment ago
      const lagAge = tau - WATER_LAG;
      const rc = lagAge > 0 ? P.main.R0 + (P.main.Rmax - P.main.R0) * P.ease(Math.min(1, lagAge / P.main.Tw), P.main.p) : -1e4;
      const band = 10 * rd + 0.28 * Math.max(0, rc);
      const clearAll = sstep(T.settle - 100, T.end - 150, t);
      return {
        t, tau, fade, cam, fwd, up, dy, ax, ay, crown, jet, rc, band, clearAll,
        s: f / cam[1],                                        // page pixels per world unit (looking down)
        splash: tau > 0 && tau < 1100 ? 1 : 0,
        calm: sstep(560, 860, tau),
        expo: sstep(0, 650, t), vig: (light ? 0.1 : 0.35) * (1 - sstep(T.impact, T.impact + 900, t)),
        amb: 0.011 * (1 - fade),
      };
    };

    const draw = (S) => {
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uPx, canvas.width / W);
      gl.uniform2f(U.uC, C.x, C.y);
      gl.uniform1f(U.uF, f);
      gl.uniform3fv(U.uCam, S.cam); gl.uniform3fv(U.uFwd, S.fwd); gl.uniform3fv(U.uUp, S.up);
      gl.uniform1f(U.uT, S.t); gl.uniform1f(U.uRd, rd);
      gl.uniform4f(U.uDrop, 0, S.dy, 0, S.ax > 0.01 ? 1 : 0);
      gl.uniform2f(U.uDropAx, Math.max(S.ax, 0.01), Math.max(S.ay, 0.01));
      gl.uniform4fv(U.uPk, pk); gl.uniform4fv(U.uPq, pq);
      gl.uniform4fv(U.uCrown, S.crown); gl.uniform2fv(U.uJet, S.jet); gl.uniform1f(U.uCalm, S.calm);
      gl.uniform4f(U.uRev, S.rc, S.band, S.fade, S.clearAll);
      gl.uniform1f(U.uExpo, S.expo); gl.uniform1f(U.uAmb, S.amb); gl.uniform1f(U.uVig, S.vig); gl.uniform1f(U.uSplash, S.splash);
      gl.uniform3fv(U.uMurk, bgD);
      for (const k in pal) gl.uniform3fv(U[k], pal[k]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // ---- The real page under the water ----
    const grad = (x, z) => {
      let gx = 0, gz = 0;
      for (let i = 0; i < WATER_NP; i++) {
        const A = pk[i * 4 + 3];
        if (!A) continue;
        const dx = x - pk[i * 4], dz = z - pk[i * 4 + 1], r = Math.hypot(dx, dz) + 0.001;
        const xi = r - pk[i * 4 + 2], s = xi < 0 ? pq[i * 4 + 1] : pq[i * 4 + 2], qq = xi / s;
        const e = Math.exp(-0.5 * qq * qq);
        if (e < 0.002) continue;
        const k = pq[i * 4], ph = k * r + pq[i * 4 + 3], g = 1 / Math.sqrt(1 + r / (8 * rd));
        const dh = A * g * ((-qq / s) * e * Math.cos(ph) - e * k * Math.sin(ph));
        gx += (dh * dx) / r; gz += (dh * dz) / r;
      }
      return [gx, gz];
    };
    let domOn = null;
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    const applyDom = (S) => {
      const on = S.tau > WATER_LAG - 120;
      if (on !== domOn) {
        domOn = on;
        hero.style.visibility = nav.style.visibility = on ? "" : "hidden";
        focus.forEach((el) => (el.style.display = on ? "" : "none"));
      }
      if (!on) return;
      hero.style.scale = nav.style.scale = S.s.toFixed(4);
      // Depth of field: three blur layers whose clear centres open just behind the wave
      [S.rc - S.band / 2, S.rc, S.rc + S.band / 2].forEach((r, i) => {
        const r0 = Math.max(0, r * S.s), r1 = r0 + S.band * S.s * 0.45;
        const m = `radial-gradient(circle at ${C.x}px ${C.y}px, transparent ${r0.toFixed(1)}px, #000 ${r1.toFixed(1)}px)`;
        focus[i].style.webkitMaskImage = m;
        focus[i].style.maskImage = m;
      });
      // Refraction: each element shifts with the slope of the water above it and stretches
      // with its curvature, like the floor of a pool seen through ripples
      const KR = 3.2 * rd, KJ = 0.32 * rd, e = 2;
      items.forEach((it) => {
        const g = grad(it.x, it.z);
        const gxp = grad(it.x + e, it.z), gxm = grad(it.x - e, it.z), gzp = grad(it.x, it.z + e), gzm = grad(it.x, it.z - e);
        const hxx = (gxp[0] - gxm[0]) / (2 * e), hzz = (gzp[1] - gzm[1]) / (2 * e), hxz = (gzp[0] - gzm[0]) / (2 * e);
        const a = 1 - clamp(KJ * hxx, 0.12), d = 1 - clamp(KJ * hzz, 0.12), b = -clamp(KJ * hxz, 0.08);
        const tx = clamp(-KR * g[0], rd), tz = clamp(-KR * g[1], rd);
        it.el.style.transform = `matrix(${a.toFixed(4)},${b.toFixed(4)},${b.toFixed(4)},${d.toFixed(4)},${tx.toFixed(2)},${tz.toFixed(2)})`;
      });
    };

    measure();
    const render = (t) => {
      const S = scene(t);
      draw(S);
      overlay.classList.add("live");                           // the canvas paints everything from here
      applyDom(S);
      overlay.classList.toggle("show-status", t > 250 && t < T.fall + 150);
      return S;
    };

    // The page in its normal state: no refraction, no camera scale, nothing hidden
    const resetDom = () => {
      targets.forEach((el) => (el.style.transform = ""));
      hero.style.scale = nav.style.scale = "";
      hero.style.visibility = nav.style.visibility = "";
      hero.style.transformOrigin = saved.hero; nav.style.transformOrigin = saved.nav;
      focus.forEach((el) => el.remove());
    };
    const cleanup = () => {
      resetDom();
      removeEventListener("resize", onResize);
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach((n) => removeEventListener(n, skip));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };

    // Test hook: ?intro&introSeek renders chosen moments on demand instead of playing
    if (seekMode) {
      window.__intro = { seek: render, end: () => { cleanup(); resolve(true); } };
      return;
    }

    // Any key, click, tap or scroll attempt skips ahead: the water simply fades away
    let skipAt = 0;
    const skip = (e) => {
      if (skipAt || (e.type === "keydown" && ["Shift", "Control", "Alt", "Meta"].includes(e.key))) return;
      skipAt = performance.now();
    };
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((n) => addEventListener(n, skip, { passive: true }));
    const onResize = () => measure();
    addEventListener("resize", onResize);

    let start = 0, last = 0, done = false;
    const times = [];
    const finish = () => {
      if (done) return;
      done = true;
      if (perf && times.length) {
        const s = times.slice(5).sort((a, b) => a - b);
        console.log(`intro frames ${s.length}, median ${s[s.length >> 1].toFixed(1)}ms, p90 ${s[Math.floor(s.length * 0.9)].toFixed(1)}ms, scale ${pxScale}`);
      }
      cleanup();
      resolve(true);
    };
    setTimeout(finish, 12000);                                 // never block the page
    const frame = (now) => {
      if (done) return;
      if (!start) start = now;
      if (last) {
        const dt = now - last;
        times.push(dt);
        // Too slow for this device? Render fewer pixels (the scene is soft enough to take it)
        if (times.length === 24 || times.length === 48) {
          const s = times.slice(-16).sort((a, b) => a - b), med = s[8];
          if (med > 21 && pxScale > 0.6) { pxScale = Math.max(0.6, pxScale * (med > 30 ? 0.7 : 0.82)); resize(); }
        }
      }
      last = now;
      const t = now - start;
      if (skipAt) {
        // The page is already in place beneath; the last frame of water just fades off it
        if (domOn !== "skipped") { domOn = "skipped"; resetDom(); }
        const k = Math.min(1, (now - skipAt) / 400);
        overlay.style.opacity = 1 - k;
        if (k >= 1) { finish(); return; }
        requestAnimationFrame(frame);
        return;
      }
      render(t);
      if (t >= T.end) { finish(); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
