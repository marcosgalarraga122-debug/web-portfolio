/* ---------- Intro: a drop of water creates the site ----------
   Plays once per visitor (intro() in main.js decides when). A single WebGL fragment shader
   ray-traces a small scene in the site's own palette while the real page waits under water.

   It is real water, filmed in slow motion: a 2 mm drop with water's own gravity, surface
   tension and viscosity, played 22 times slower than life until the impact, then ramping up
   towards real time as the waves spread (a speed ramp, as a film would do it).

   1. The drop has just pinched off. It falls from rest, still ringing gently between squat
      and tall with a hint of an egg shape (the way real drops oscillate), in a softly lit
      studio that it reflects and refracts. The camera falls with it, then cranes up as the
      water comes up to meet it.
   2. On contact the drop joins the pool through a liquid neck and pushes a crater open. The
      whole surface is one solution of the equations for waves on deep water, driven by the
      drop's momentum (linear theory, including each particle's sideways motion, which
      steepens the crater and sharpens its lip): the crater fills back in, its lip runs
      outward as the first wave, short capillary ripples race ahead, longer waves follow and
      a calm circle opens behind them. Every reflection bends with that surface.
   3. Behind the waves the water clears: the page comes into focus (layered backdrop blurs),
      every element is refracted by the same waves (CSS transforms on the real HTML), the
      hero background bends with them (main.js), light catches the page in caustics, and the
      camera settles at exactly the page's scale. The waves die away and the overlay leaves
      nothing but the normal page.

   World units are CSS pixels of the final view, so the water and the page line up exactly.
   waterIntro() resolves true when it has played, false if it couldn't run (no WebGL, shader
   error), in which case main.js falls back to its short reveal. */

const WATER_T = { fall: 900, impact: 1900, settle: 3600, fade: 3350, end: 4250 }; // ms
// Water, per drop radius a (a 2 mm drop): gravity (a/s²), surface tension over density
// (a³/s²) and viscosity (a²/s); and how much slower than life the film runs until impact
const WATER_PHYS = { g: 4905, sigma: 9100, nu: 0.25, slow: 1 / 22 };

const v3 = {
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; },
  glsl: (a) => `vec3(${a.map((x) => x.toFixed(5)).join(",")})`,
};
// Studio lights (directions from the scene): a round softbox above-left of the first camera,
// and four small lights far away on the wall behind the drop, out of focus
const WATER_KEY = v3.norm([-0.55, 0.62, 0.56]);
const WATER_BOKEH = [[-0.47, 0.022, 0.008, 0.9], [-0.2, 0.05, 0.006, 0.55], [0.27, 0.018, 0.0085, 0.8], [0.58, 0.04, 0.0065, 0.5]]
  .map(([az, el, size, k]) => ({ dir: v3.norm([Math.sin(az), el, -Math.cos(az)]), size, k }));

// The surface around the impact, shared with the hero background (main.js), which it
// refracts too: height and slope by distance from the impact point, solved each frame on the
// CPU (see waterWaves) and stored in a small texture, 16 bits per value
const WATER_RIPPLE = `
uniform sampler2D uProf;
uniform vec4 uProfS;     // world px per sample, height range, slope range, samples (0 = calm water)
uniform vec4 uProfA;     // a little stronger on one side, away from the centre: amount, direction, distance it takes
float profBits(vec2 c) { return dot(c, vec2(65280., 255.) / 65535.) * 2. - 1.; }
vec4 wave(vec2 p) {      // height, slope x, slope z, curvature (laplacian)
  if (uProfS.w < 2.) return vec4(0.);
  float r = length(p) + 1e-3, u = r / uProfS.x;
  if (u >= uProfS.w - 2.) return vec4(0.);
  float i = floor(u), f = u - i, dx = uProfS.x;
  vec4 a = texture2D(uProf, vec2((i + .5) / uProfS.w, .5)), b = texture2D(uProf, vec2((i + 1.5) / uProfS.w, .5));
  float h0 = profBits(a.rg) * uProfS.y, h1 = profBits(b.rg) * uProfS.y;
  float s0 = profBits(a.ba) * uProfS.z, s1 = profBits(b.ba) * uProfS.z;
  float f2 = f * f, f3 = f2 * f;
  float h = (2. * f3 - 3. * f2 + 1.) * h0 + (f3 - 2. * f2 + f) * dx * s0 + (3. * f2 - 2. * f3) * h1 + (f3 - f2) * dx * s1;
  float s = mix(s0, s1, f);
  vec2 d = p / r;
  return vec4(h, s * d, (s1 - s0) / dx + s / r) * (1. + uProfA.x * dot(p, uProfA.yz) / sqrt(r * r + uProfA.w * uProfA.w));
}`;

const WATER_VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const WATER_FRAG = `
precision highp float;
uniform vec2 uRes;       // drawing buffer size
uniform float uPx;       // drawing-buffer pixels per CSS pixel
uniform vec2 uC;         // where the impact point sits on screen (CSS px)
uniform float uF;        // focal length (CSS px)
uniform vec3 uCam, uFwd, uUp;
uniform float uSig, uRd; // scene time (s, 0 at impact), drop radius
uniform vec2 uGS;        // gravity and surface tension in world units (for the air's ripples)
uniform vec4 uDrop;      // drop centre; w: 1 = falling, 2 = merging into the pool, 0 = gone
uniform vec4 uDropS;     // its radius, P2 and P3 shape modes, how much the merging drop still looks like itself
uniform float uNeck;     // width of the liquid neck that joins it to the pool
uniform vec4 uSplash;    // where the surface is marched as geometry: radius, lowest, highest point; on
uniform vec4 uRev;       // clear-water radius, band width, effects fade, final clear
uniform float uCalm;     // 0 while the centre is busy, 1 once it has settled
uniform float uExpo, uAmb, uVig;
uniform vec3 uMurk;      // the water body, in display colour (= the page background)
uniform vec3 uSkyTop, uSkyHor, uGlow, uKey, uStrip, uPanel, uFill, uDeep, uCau, uBokeh;
uniform vec4 uLook;      // light theme: lights become dark flags (far wall, overhead); murk variation
${WATER_RIPPLE}

const vec3 KC = ${v3.glsl(WATER_KEY)};
${WATER_BOKEH.map((b, i) => `const vec4 BK${i} = vec4(${v3.glsl(b.dir).slice(5, -1)}, ${b.size.toFixed(4)});`).join("\n")}

float fres(float c) { float m = 1. - c; float m2 = m * m; return .02 + .98 * m2 * m2 * m; } // water, n = 1.333

float hash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1., 0., 0.)), f.x), mix(hash(i + vec3(0., 1., 0.)), hash(i + vec3(1., 1., 0.)), f.x), f.y),
             mix(mix(hash(i + vec3(0., 0., 1.)), hash(i + vec3(1., 0., 1.)), f.x), mix(hash(i + vec3(0., 1., 1.)), hash(i + vec3(1., 1., 1.)), f.x), f.y), f.z);
}
float bokeh(vec3 d, vec4 b) { float c = dot(d, b.xyz); return smoothstep(cos(b.w * 1.3), cos(b.w * .75), c); }

// The studio around the water, in the page's colours. Its lights are far brighter than its
// walls, as real lights are, but small, so the 2% that water reflects head-on still reads as
// light: a round softbox for the drop's highlight, a narrow tube overhead whose reflection the
// waves break into bright lines, a square softbox beside it with soft edges for the waves to
// bend, and the far wall behind the drop, washed by a light hidden below the horizon, with a
// few small lights on it out of focus
vec3 sky(vec3 d) {
  float y = d.y, az = atan(d.x, -d.z);
  vec3 col = mix(uSkyHor, uSkyTop, smoothstep(0., .4, y)) * (.84 + .32 * vnoise(d * 2.6 + 3.1));
  // On the dark set these are lights; on the light set they are dark flags (uLook.x/y > 0)
  float wall = exp(-az * az * 1.4) * exp(-max(y, 0.) * 4.) * smoothstep(-.015, .012, y);
  col = col * (1. - min(wall, 1.) * uLook.x) + uGlow * wall;
  float bk = bokeh(d, BK0) * ${WATER_BOKEH[0].k.toFixed(2)} + bokeh(d, BK1) * ${WATER_BOKEH[1].k.toFixed(2)}
           + bokeh(d, BK2) * ${WATER_BOKEH[2].k.toFixed(2)} + bokeh(d, BK3) * ${WATER_BOKEH[3].k.toFixed(2)};
  col = col * (1. - min(bk, 1.) * uLook.x) + uBokeh * bk;
  col += uKey * smoothstep(.9968, .9986, dot(d, KC));
  float x = d.x * .985 - d.z * .17 - .12;       // a little to one side and turned, as a real rig would be
  float over = smoothstep(.3, .6, y) * smoothstep(.55, .2, d.z);
  float sm = (smoothstep(.009, .005, abs(x)) + .035 * exp(-x * x * 250.)) * over;   // the tube, and its spill on the ceiling
  vec2 bq = abs(d.xz / max(y, .2) - vec2(-.3, -.2));
  float pn = smoothstep(.1, .06, bq.x) * smoothstep(.065, .035, bq.y) * (1. - .6 * dot(bq, bq) / .013) * step(.3, y);   // brightest in the middle
  col = col * (1. - min(sm, 1.) * uLook.y) + uStrip * sm;
  col = col * (1. - min(pn, 1.) * uLook.y * .5) + uPanel * pn;
  col += uFill * exp(-pow((y - .08) / .14, 2.)) * smoothstep(-.2, .6, d.z);
  return col;
}
vec3 env(vec3 d) {
  if (d.y >= 0.) return sky(d);
  // Below the horizon: the far water, mirroring the room at grazing angles
  vec3 m = sky(vec3(d.x, -d.y, d.z));
  return mix(uDeep, m, fres(-d.y));
}

// Soft shoulder for highlights only (above the page's own colours), then display gamma
vec3 tone(vec3 c) {
  vec3 x = max(c, 0.);
  x = mix(x, .92 + .08 * (1. - exp(-(x - .92) / .08)), step(.92, x));
  return pow(x, vec3(1. / 2.2));
}

// A perfectly still surface never looks like water: the air in the room keeps three slow
// swells and three finer ripples on it, each moving at the speed water gives its wavelength
vec3 ambW(vec2 p, vec2 d, float L, float a, float ph) {
  float k = 6.2832 / (L * uRd), w = sqrt(uGS.x * k + uGS.y * k * k * k);
  float x = dot(p, d) * k - w * uSig + ph;
  return a * vec3(sin(x), cos(x) * k * d);
}
vec3 amb(vec2 p) {
  vec3 o = ambW(p, vec2(.8, .6), 11., 1., 0.) + ambW(p, vec2(-.44, .898), 6.3, .35, 1.3) + ambW(p, vec2(.17, -.985), 16., .8, 2.1)
         + ambW(p, vec2(.94, -.34), 2.1, .035, .4) + ambW(p, vec2(-.7, -.714), 1.6, .035, 2.9) + ambW(p, vec2(.31, .95), 2.7, .035, 4.4);
  return o * uAmb * uRd;
}

// The drop: a sphere of water held by surface tension, still ringing from when it pinched
// off, between squat and tall (the P2 mode) with a hint of an egg shape (P3)
float dropR(vec3 u) {
  float c = u.y;
  return uDropS.x * (1. + uDropS.y * .5 * (3. * c * c - 1.) + uDropS.z * .5 * (5. * c * c - 3.) * c);
}
float sdDrop(vec3 p) { vec3 q = p - uDrop.xyz; float l = max(length(q), 1e-4); return l - dropR(q / l); }
vec3 nDrop(vec3 p) {
  vec3 q = p - uDrop.xyz; float l = max(length(q), 1e-4); vec3 u = q / l; float c = u.y;
  float dR = uDropS.x * (3. * uDropS.y * c + uDropS.z * (7.5 * c * c - 1.5));
  return normalize(u - dR * (vec3(0., 1., 0.) - c * u) / l);
}
// Where a ray meets the drop's surface: entering it (dir 1), or leaving it from inside (dir -1)
bool hitDrop(vec3 ro, vec3 rd, float dir, out float t) {
  vec3 oc = ro - uDrop.xyz;
  float Rb = uDropS.x * (1. + abs(uDropS.y) + abs(uDropS.z)) * 1.01;
  float b = dot(oc, rd), h = b * b - dot(oc, oc) + Rb * Rb;
  t = 0.;
  if (h < 0.) return false;
  h = sqrt(h);
  float t0 = -b - h, t1 = -b + h;
  if (t1 < 0.) return false;
  if (dir > 0.) {
    t = max(t0, 0.);
    for (int i = 0; i < 10; i++) t += .97 * sdDrop(ro + rd * t);
    return t < t1 && sdDrop(ro + rd * t) < .004 * uDropS.x;
  }
  t = t1;
  for (int i = 0; i < 8; i++) t -= .97 * sdDrop(ro + rd * t);
  return true;
}
// Light leaving a drop through its far side, after refraction (and one internal bounce at most)
vec3 through(vec3 p, vec3 t1, float eta) {
  float a;
  hitDrop(p, t1, -1., a);
  vec3 p2 = p + t1 * a, n2 = nDrop(p2);
  vec3 t2 = refract(t1, -n2, eta);
  if (dot(t2, t2) < .5) {
    vec3 tb = reflect(t1, -n2);
    hitDrop(p2, tb, -1., a);
    vec3 n3 = nDrop(p2 + tb * a);
    t2 = refract(tb, -n3, eta);
    if (dot(t2, t2) < .5) t2 = reflect(tb, -n3);
  }
  return t2;
}
// Fresnel reflection of the room plus the room seen through the drop, upside down and
// magnified. Water is clear (no glassy tint); the hero drop splits the colours very slightly.
vec3 dropShade(vec3 p, vec3 n, vec3 rd, bool disperse) {
  float F = fres(clamp(dot(-rd, n), 0., 1.));
  vec3 col = env(reflect(rd, n)) * F, tr;
  if (disperse) {
    tr.r = env(through(p, refract(rd, n, 1. / 1.330), 1.330)).r;
    tr.g = env(through(p, refract(rd, n, 1. / 1.333), 1.333)).g;
    tr.b = env(through(p, refract(rd, n, 1. / 1.338), 1.338)).b;
  } else tr = env(through(p, refract(rd, n, 1. / 1.333), 1.333));
  return col + tr * (1. - F);
}

// The pool's surface as geometry near the impact. While the drop merges, it joins the water
// through a smooth neck instead of simply touching it, the way two bodies of liquid coalesce.
float smin(float a, float b, float k) { float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float field(vec3 p) {
  float w = p.y - wave(p.xz).x;
  return uDrop.w > 1.5 ? smin(w, sdDrop(p), uNeck) : w;
}
vec3 fieldN(vec3 p) {
  vec2 e = vec2(.04 * uRd, 0.);
  return normalize(vec3(field(p + e.xyy) - field(p - e.xyy), field(p + e.yxy) - field(p - e.yxy), field(p + e.yyx) - field(p - e.yyx)));
}
bool marchSplash(vec3 ro, vec3 rd, out vec3 hit) {
  float Rb = uSplash.x, y0 = uSplash.y, y1 = uSplash.z;
  hit = vec3(0.);
  if (abs(rd.y) < 1e-4) return false;
  float ta = (y1 - ro.y) / rd.y, tb = (y0 - ro.y) / rd.y;
  float tmin = min(ta, tb), tmax = max(ta, tb);
  float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz), k = dot(ro.xz, ro.xz) - Rb * Rb;
  float disc = b * b - a * k;
  if (disc < 0. || a < 1e-8) return false;
  disc = sqrt(disc);
  tmin = max(max(tmin, (-b - disc) / a), 0.);
  tmax = min(tmax, (-b + disc) / a);
  if (tmin >= tmax || field(ro + rd * tmin) < 0.) return false;   // (under water already: it met the pool further out)
  // Steps that can never pass through the surface, however steep it is (its steepest slope
  // bounds how fast the ray can close in on it), so even a thin crest is never skipped
  float L = abs(rd.y) + max(uProfS.z, 1.) * length(rd.xz), t = tmin, tp = tmin;
  for (int i = 0; i < 48; i++) {
    float d = field(ro + rd * t);
    if (d < 0.) {
      float lo = tp, hi = t;
      for (int j = 0; j < 5; j++) { float m = .5 * (lo + hi); if (field(ro + rd * m) < 0.) hi = m; else lo = m; }
      hit = ro + rd * hi;
      return true;
    }
    if (t > tmax) return false;
    tp = t;
    t += max(.9 * d / L, .006 * uRd);
  }
  return false;
}
// Everywhere else the waves are gentle: find where the ray meets them by refining its hit on
// the still plane (each step looks up the height where the last one landed)
vec3 surfaceHit(vec3 ro, vec3 rd) {
  float t = -ro.y / rd.y;
  for (int i = 0; i < 3; i++) t = (wave((ro + rd * t).xz).x - ro.y) / rd.y;
  return ro + rd * t;
}

// How clear the water is at a point (h: the surface height there): it clears behind the waves,
// crests carrying the edge forward a little, but not through the busy centre until it settles
float clearAt(vec2 xz, float h) {
  float c = smoothstep(uRev.x + .5 * uRev.y, uRev.x - .5 * uRev.y, length(xz) - 20. * h);
  return max(c * mix(smoothstep(3.5 * uRd, 6.5 * uRd, length(xz)), 1., uCalm), uRev.w);
}
// Waves focus light onto the page beneath
float caustic(vec4 wv, float clear) { return pow(clamp(-wv.w * uRd * 5., 0., 1.), 1.6) * 1.6 * clear * (1. - uRev.z); }

// The water surface: reflection on top, the page (or deep water) underneath
vec4 water(vec3 p, vec3 n, vec3 rd, vec4 wv, float foot) {
  float F0 = fres(clamp(dot(-rd, n), 0., 1.)) * (1. - uRev.z);
  vec3 rr = reflect(rd, n);
  vec3 L;
  float tt, cone = 2. * abs(wv.w) * foot;
  if (uDrop.w > .5 && hitDrop(p, rr, 1., tt)) { vec3 q = p + rr * tt; L = dropShade(q, nDrop(q), rr, false); }
  else if (cone > .015) {
    // The surface curves faster here than one pixel can show (a crest, the crater's lip): see
    // the average of the directions the pixel takes in, not one picked at random
    vec3 a = normalize(cross(rr, vec3(.0, 1., .001))), b = cross(rr, a);
    float c = .5 * min(cone, .4);
    L = .25 * (env(normalize(rr + a * c)) + env(normalize(rr - a * c)) + env(normalize(rr + b * c)) + env(normalize(rr - b * c)));
  } else L = env(rr);
  float clear = clearAt(p.xz, wv.x);
  // Where the page shows through, its own light outshines the reflections
  float F = F0 * mix(1., .003, clear) * smoothstep(1., .99, clear);
  float cau = caustic(wv, clear);
  // The water body, with a soft unevenness in its depth that the waves bend (refraction), lit
  // through the moving surface: crests focus the light from above onto the floor and troughs
  // spread it (caustics, softened by the murky water)
  float depth = 1. + uLook.w * (vnoise(vec3((p.xz + 6. * uRd * wv.yz) / (9. * uRd), 1.7)) - .5);
  float fc = -.9 * uRd * wv.w * (1. - uRev.z);
  vec3 body = pow(uMurk, vec3(2.2)) * depth * (1. + .45 * fc / (1. + abs(fc)));
  // The falling drop shades the floor from the light overhead (the higher it is, the softer
  // its shadow), and as a lens it gathers some of that light into a spot in the middle
  if (uDrop.w > .5 && uDrop.w < 1.5) {
    float d = length(p.xz - uDrop.xz), R = uDropS.x, pen = .14 * (uDrop.y + 4. * uRd);
    body *= 1. - .45 * smoothstep(R + pen, R - .5 * pen, d) + .5 * smoothstep(.6 * R + .5 * pen, 0., d) * smoothstep(9. * uRd, 2. * uRd, uDrop.y);
  }
  // Reflection and the water beneath add up as light (Fresnel-weighted) before the tone curve.
  // Where the water has cleared, only the reflection remains: light added to the page's own
  // (the page colour is the water body's), so a faint reflection stays faint
  float k = 1. - clear;
  vec3 rgb = k * tone(L * F + (1. - F) * body) + (1. - k) * (tone(body + L * F) - tone(body)) + cau * uCau * (1. - F);
  float al = k + (1. - k) * F;
  al = max(al, max(rgb.r, max(rgb.g, rgb.b)));
  return vec4(rgb, min(al, 1.));
}

vec4 trace(vec3 ro, vec3 rd) {
  // Behind the waves, where the water has cleared, only the caustics on the page are left
  if (rd.y < 0.) {
    vec3 p0 = ro - rd * (ro.y / rd.y);
    if ((uSplash.w < .5 || length(p0.xz) > uSplash.x) && clearAt(p0.xz, -uProfS.y) > .9995) {
      vec3 c = caustic(wave(p0.xz), 1.) * uCau;
      return vec4(c, max(c.r, max(c.g, c.b)));
    }
  }
  float tD = 1e9, tt;
  if (uDrop.w > .5 && uDrop.w < 1.5 && hitDrop(ro, rd, 1., tt)) tD = tt;
  vec3 pW = vec3(0.);
  float tW = 1e9;
  bool marched = false;
  if (uSplash.w > 0. && marchSplash(ro, rd, pW)) { tW = dot(pW - ro, rd); marched = true; }
  else if (rd.y < 0.) { pW = surfaceHit(ro, rd); tW = dot(pW - ro, rd); }

  if (tD < tW) { vec3 p = ro + rd * tD; return vec4(tone(dropShade(p, nDrop(p), rd, true)), 1.); }
  if (tW < 1e8) {
    vec4 wv = wave(pW.xz);
    vec3 am = amb(pW.xz) * exp(-tW / (90. * uRd));
    vec3 n;
    float drop = 0.;
    if (marched) {
      vec3 ns = fieldN(pW);
      n = normalize(ns + vec3(-am.y, 0., -am.z) * max(ns.y, 0.));
      if (uDrop.w > 1.5) drop = uDropS.w * clamp(.5 + .5 * (pW.y - wv.x - sdDrop(pW)) / uNeck, 0., 1.);
    } else n = normalize(vec3(-wv.y - am.y, 1., -wv.z - am.z));
    vec4 c = water(pW, n, rd, wv, tW / (uF * uPx * max(abs(dot(rd, n)), .15)));
    if (drop > 0.) c = mix(c, vec4(tone(dropShade(pW, n, rd, false)), 1.), drop);
    return c;
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
  if (uDrop.w > .5) {
    vec3 dc = uDrop.xyz - uCam;
    float dl = length(dc);
    float ang = acos(clamp(dot(rd, dc / dl), -1., 1.));
    float pix = 2. / (uF * uPx), e = abs(uDropS.y) + abs(uDropS.z);
    float rmin = asin(min(.999, uDropS.x * (1. - e) / dl)), rmax = asin(min(.999, uDropS.x * (1. + e) / dl));
    edge = step(rmin - pix, ang) * step(ang, rmax + pix);
  }
  // ...and, more lightly, the crater while it is drawn as geometry (its lip is a hard edge
  // against the water behind it)
  bool crater = false;
  if (uSplash.w > 0. && edge < .5 && rd.y < 0.) {
    float t0 = (uSplash.y - uCam.y) / rd.y, t1 = -uCam.y / rd.y;
    crater = min(length((uCam + rd * t0).xz), length((uCam + rd * t1).xz)) < uSplash.x;
  }
  float o = .3 / uPx;
  if (edge > 0.) {
    col = .25 * (trace(uCam, ray(px + vec2(-o, -o))) + trace(uCam, ray(px + vec2(o, -o)))
               + trace(uCam, ray(px + vec2(-o, o))) + trace(uCam, ray(px + vec2(o, o))));
  } else if (crater) col = .5 * (trace(uCam, ray(px + vec2(-o, -.4 * o))) + trace(uCam, ray(px + vec2(o, .4 * o))));
  else col = trace(uCam, rd);

  // Exposure rises from the page colour; a soft vignette while the scene is cinematic
  col.rgb = mix(uMurk * col.a, col.rgb, uExpo);
  vec2 q = (px - .5 * uRes / uPx) / (uRes.y / uPx);
  col.rgb *= 1. - uVig * smoothstep(.35, 1.1, length(q));
  // Dither away banding in the dark gradients
  col.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) / 255. * col.a;
  gl_FragColor = col;
}`;

// The waves' state for the current frame, read by the hero background (main.js) so it is
// refracted by the same surface; null when no intro is playing
let waterRipple = null;

// Bessel functions J0 and J1 of x >= 0 (rational approximations, error about 1e-8)
function waterBessel(x, out) {
  if (x < 8) {
    const y = x * x;
    out[0] = (57568490574 + y * (-13362590354 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456)))))
           / (57568490411 + y * (1029532985 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y)))));
    out[1] = (x * (72362614232 + y * (-7895059235 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606))))))
           / (144725228442 + y * (2300535178 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y)))));
    return;
  }
  const z = 8 / x, y = z * z, s = Math.sqrt(0.636619772 / x), x0 = x - 0.785398164, x1 = x - 2.356194491;
  out[0] = s * (Math.cos(x0) * (1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6))))
              - z * Math.sin(x0) * (-0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)))));
  out[1] = s * (Math.cos(x1) * (1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6))))
              - z * Math.sin(x1) * (0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)))));
}

// ---- The surface after the impact, solved as real water ----
// Linear waves on deep water (gravity, surface tension, viscosity), set going by the
// momentum the drop gives the pool while it pushes in, summed over wavenumbers (a Hankel
// transform, exact for a round impact). Every particle of the surface also moves sideways, as
// in real water; drawing it where the particles actually are steepens the crater walls and
// sharpens the crests. The result is one profile by distance from the impact (radius R px),
// shared by the shader, the hero background and the page's elements.
function waterWaves(rd, R, U) {
  const N = 1024, dR = R / (N - 1);
  const g = WATER_PHYS.g * rd, st = WATER_PHYS.sigma * rd ** 3, nu = WATER_PHYS.nu * rd * rd;
  const b = 0.85 * rd, V = (4 / 3) * Math.PI * rd ** 3;
  const Tp = (2 * rd) / U;                               // the drop pushes in over the time it takes to pass its own diameter
  const dk = Math.PI / R, K = Math.ceil(5.2 / b / dk);
  const k = new Float64Array(K), w = new Float64Array(K), A = new Float64Array(K), s0 = new Float64Array(K), v0 = new Float64Array(K);
  const TAPS = 16;
  const push = (tau) => (1 - Math.cos((2 * Math.PI * tau) / Tp)) / Tp;
  for (let i = 0; i < K; i++) {
    k[i] = (i + 0.5) * dk;
    w[i] = Math.sqrt(g * k[i] + st * k[i] ** 3);
    A[i] = -((V * U) / (2 * Math.PI)) * k[i] * k[i] * Math.exp(-((k[i] * b) ** 2) / 2) * dk;
    let s = 0, v = 0;                                    // each mode's state once the drop has finished pushing
    for (let m = 0; m < TAPS; m++) {
      const tau = ((m + 0.5) / TAPS) * Tp, h = (push(tau) * Tp) / TAPS;
      s += (h * Math.sin(w[i] * (Tp - tau))) / w[i];
      v += h * Math.cos(w[i] * (Tp - tau));
    }
    s0[i] = s; v0[i] = v;
  }
  const early = (i, sig) => {                            // ...and while it still is
    let s = 0;
    for (let m = 0; m < TAPS; m++) { const tau = ((m + 0.5) / TAPS) * sig; s += (push(tau) * (sig / TAPS) * Math.sin(w[i] * (sig - tau))) / w[i]; }
    return s;
  };
  const J0 = new Float32Array(N * K), J1 = new Float32Array(N * K), o = [0, 0];
  for (let j = 0; j < N; j++) for (let i = 0; i < K; i++) { waterBessel(k[i] * j * dR, o); J0[j * K + i] = o[0]; J1[j * K + i] = o[1]; }
  const cgMax = (g + 3 * st * k[K - 1] ** 2) / (2 * w[K - 1]);    // nothing travels faster than this

  const c = new Float64Array(K), eta = new Float64Array(N), X = new Float64Array(N);
  const E = new Float64Array(N), H = new Float32Array(N), S = new Float32Array(N), bytes = new Uint8Array(N * 4);
  const bs = Math.max(0.7, (0.25 * rd) / dR), BL = Math.ceil(3 * bs), blur = [...Array(BL + 1)].map((_, q) => Math.exp(-(q * q) / (2 * bs * bs)));
  const out = { N, dR, H, S, bytes, scale: [dR, 0, 0, 0] };
  out.at = (sig) => {
    H.fill(0); S.fill(0);
    out.scale[3] = 0;
    if (sig <= 0) return out;
    let cmax = 0, kUse = 0;
    for (let i = 0; i < K; i++) {
      const s = sig < Tp ? early(i, sig) : s0[i] * Math.cos(w[i] * (sig - Tp)) + (v0[i] / w[i]) * Math.sin(w[i] * (sig - Tp));
      c[i] = A[i] * s * Math.exp(-2 * nu * k[i] * k[i] * sig);
      cmax = Math.max(cmax, Math.abs(c[i]));
    }
    for (let i = K - 1; i >= 0; i--) if (Math.abs(c[i]) > 1e-5 * cmax) { kUse = i + 1; break; }
    const jMax = Math.min(N - 2, Math.ceil((cgMax * sig + 10 * b) / dR));
    // The particle that started at distance r is now at r + xi, at height eta
    let prev = -dR;
    for (let j = 0; j <= jMax + 1; j++) {
      let e = 0, x = 0;
      const row = j * K;
      for (let i = 0; i < kUse; i++) { e += c[i] * J0[row + i]; x -= c[i] * J1[row + i]; }
      eta[j] = e;
      X[j] = prev = Math.max(j * dR + x, prev + 0.5 * dR);      // (it never folds over itself)
    }
    // The same surface at fixed distances from the impact, which is what the shaders look up
    const top = Math.min(N - 2, Math.floor(X[jMax] / dR));
    for (let m = 0, j = 0; m <= top; m++) {
      const x = m * dR;
      while (j < jMax && X[j + 1] < x) j++;
      const f = Math.min(1, Math.max(0, (x - X[j]) / (X[j + 1] - X[j])));
      E[m] = eta[j] + (eta[j + 1] - eta[j]) * f;
    }
    // Surface tension rounds every crest (no real water surface has a sharp edge)
    for (let m = 0; m <= top; m++) {
      let a = 0, n = 0;
      for (let q = -BL; q <= BL; q++) { const i = Math.abs(m + q), wq = blur[Math.abs(q)]; if (i <= top) { a += E[i] * wq; n += wq; } }
      H[m] = a / n;
    }
    let mh = 1e-9, ms = 1e-9;
    for (let m = 1; m <= top; m++) {
      S[m] = (H[m + 1] - H[m - 1]) / (2 * dR);
      mh = Math.max(mh, Math.abs(H[m])); ms = Math.max(ms, Math.abs(S[m]));
    }
    mh = Math.max(mh, Math.abs(H[0])) * 1.02; ms *= 1.02;
    for (let m = 0; m < N; m++) {
      const a = Math.round((H[m] / mh + 1) * 32767.5), s = Math.round((S[m] / ms + 1) * 32767.5);
      bytes[m * 4] = a >> 8; bytes[m * 4 + 1] = a & 255; bytes[m * 4 + 2] = s >> 8; bytes[m * 4 + 3] = s & 255;
    }
    out.scale[1] = mh; out.scale[2] = ms; out.scale[3] = N;
    return out;
  };
  out.slope = (r) => { const u = r / dR; if (u >= N - 2) return 0; const i = Math.floor(u), f = u - i; return S[i] + (S[i + 1] - S[i]) * f; };
  return out;
}

function waterIntro({ overlay, chars, fitName, onStruggle }) {
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
    ["uRes", "uPx", "uC", "uF", "uCam", "uFwd", "uUp", "uSig", "uRd", "uGS", "uDrop", "uDropS", "uNeck", "uSplash", "uRev", "uCalm",
      "uExpo", "uAmb", "uVig", "uMurk", "uSkyTop", "uSkyHor", "uGlow", "uKey", "uStrip", "uPanel", "uFill", "uDeep", "uCau", "uBokeh", "uLook",
      "uProf", "uProfS", "uProfA"]
      .forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
    const profTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, profTex);
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach((p) => gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST));
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach((p) => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
    gl.uniform1i(U.uProf, 0);

    // ---- Palette: the scene is lit in the page's own colours ----
    const css = getComputedStyle(document.documentElement);
    const hex = (name) => { const n = parseInt(css.getPropertyValue(name).trim().slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255); };
    const lin = (c) => c.map((x) => Math.pow(x, 2.2));
    const mul = (c, k) => c.map((x) => x * k);
    const add = (a, b) => a.map((x, i) => x + b[i]);
    const light = document.documentElement.dataset.theme === "light";
    const bgD = hex("--bg"), bg = lin(bgD), acc = lin(hex("--accent")), fg = lin(hex("--fg"));
    const pal = light ? {
      uSkyTop: mul(bg, 0.95), uSkyHor: mul(bg, 0.62), uGlow: mul(bg, 0.2), uKey: [30, 29.5, 28.5], uBokeh: mul(fg, 2),
      uStrip: mul(fg, 1.5), uPanel: mul(fg, 2), uFill: mul(bg, 0.25), uDeep: mul(bg, 0.85), uCau: [0.03, 0.025, 0.02],
    } : {
      uSkyTop: mul(bg, 0.6), uSkyHor: add(mul(bg, 1.3), mul(acc, 0.002)), uGlow: add(mul(bg, 9), mul(acc, 0.05)),
      uKey: mul(fg, 60), uBokeh: mul(add(mul(acc, 0.6), mul(fg, 0.4)), 1.2), uStrip: mul(add(mul(fg, 0.8), mul(acc, 0.2)), 66),
      uPanel: mul(add(mul(fg, 0.85), mul(acc, 0.15)), 55), uFill: mul(add(mul(fg, 0.5), mul(acc, 0.5)), 0.25), uDeep: mul(bg, 0.9),
      uCau: [0.07, 0.06, 0.04],
    };
    // flags instead of lights (far wall, overhead); how uneven the water body is
    const look = light ? [0.45, 0.92, 0, 0.05] : [0, 0, 0, 0.22];
    const ASYM = [0.08, Math.cos(2.2), Math.sin(2.2), 0];   // the drop met the water a little off vertical

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
    let W, H, C, f, rd, items, keys, reach, D, waves, R1, vC;
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

    const T = WATER_T, R0 = WATER_PHYS.slow, RAMP = [0.15, 1.0];   // speed ramp after the impact (s)
    const SC0 = 0.035, WAKE = SC0 - 0.008;               // the water starts clearing this long after impact; the page wakes just before (scene s)
    // Scene time (s, 0 at impact) at film time t (ms): 22x slow motion, then ramping up
    const sceneTime = (t) => {
      const tau = (t - T.impact) / 1000;
      if (tau <= RAMP[0]) return R0 * tau;
      const u = Math.min(1, (tau - RAMP[0]) / (RAMP[1] - RAMP[0]));
      const F = tau < RAMP[1] ? (RAMP[1] - RAMP[0]) * (u ** 3 - u ** 4 / 2) : (RAMP[1] - RAMP[0]) / 2 + (tau - RAMP[1]);
      return R0 * tau + (R1 - R0) * F;
    };
    const measure = () => {
      targets.forEach((el) => (el.style.transform = ""));
      hero.style.scale = nav.style.scale = "";
      W = innerWidth; H = innerHeight;
      const nr = q(".hero-name").getBoundingClientRect();
      C = { x: nr.left + nr.width / 2, y: nr.top + nr.height / 2 };
      // 30° vertical field of view, widened on tall screens so the scene keeps its proportions
      f = Math.min(H / (2 * Math.tan((30 * Math.PI) / 360)), W / (2 * Math.tan((20 * Math.PI) / 360)));
      const m = Math.min(W, H);
      rd = (10 * m) / 800;                                  // drop radius
      ASYM[3] = 4 * rd;
      reach = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - C.x, y - C.y)));
      items = targets.map((el) => {
        const r = el.getBoundingClientRect();
        return r.width || r.height ? { el, x: r.left + r.width / 2 - C.x, z: r.top + r.height / 2 - C.y, hw: r.width / 2, hh: r.height / 2 } : null;
      }).filter(Boolean);
      const hr = hero.getBoundingClientRect(), vr = nav.getBoundingClientRect();
      hero.style.transformOrigin = `${C.x - hr.left}px ${C.y - hr.top}px`;
      nav.style.transformOrigin = `${C.x - vr.left}px ${C.y - vr.top}px`;

      // Camera: a close side view of the drop, craning up as it falls (about 50° at impact,
      // so the crater is seen in relief, straight down two thirds of a second later), then
      // pulling back until one world unit is exactly one CSS pixel
      const D0 = (f * rd) / (0.15 * m), D1 = f / 5;
      const lnF = Math.log(f), slope = (lnF - Math.log(D0)) / (T.settle - T.fall);
      keys = {
        elev: [[0, 1.5, 0], [T.fall - 80, 1.8, 0], [T.impact, 48, 0.075], [T.impact + 650, 90, 0]],
        dist: [[0, Math.log(D0 * 1.05), 0], [T.fall, Math.log(D0), 0], [T.impact, Math.log(D1), slope], [T.settle, lnF, 0]],
      };

      // The drop pinched off at rest as the film starts and falls under gravity until it touches
      // (0.85 m/s at impact, for real). Its two lowest modes of oscillation ring at their own
      // frequencies (surface tension), fading as it falls.
      const g = WATER_PHYS.g * rd, sRel = (-T.impact / 1000) * R0;
      const mode = (age) => [0.07 * Math.exp(-age / 0.15) * Math.cos(Math.sqrt(8 * WATER_PHYS.sigma) * age),
        0.025 * Math.exp(-age / 0.08) * Math.cos(Math.sqrt(30 * WATER_PHYS.sigma) * age)];
      const [e2i, e3i] = mode(-sRel);
      D = { g, sRel, U: g * -sRel, mode, yc0: rd * (1 + e2i - e3i), e2i, e3i };

      // The waves, and how fast the clear water follows them: just behind the main train of
      // waves, reaching the farthest corner as the camera settles, which sets how far the speed
      // ramp goes (about real time)
      waves = waterWaves(rd, reach * 1.06 + 10 * rd, D.U);
      vC = 110 * rd;
      const need = SC0 + (1.14 * reach + 5 * rd) / vC, tFull = (T.settle - T.impact - 100) / 1000;
      R1 = Math.min(1, R0 + (need - R0 * tFull) / ((RAMP[1] - RAMP[0]) / 2 + (tFull - RAMP[1])));
      domOn = null;                                         // (measuring cleared the page's state: set it again)
      resize();
    };
    let pxScale = Math.min(devicePixelRatio || 1, 1.25);
    const resize = () => {
      canvas.width = Math.round(W * pxScale);
      canvas.height = Math.round(H * pxScale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    // ---- Everything in the scene at film time t (ms) ----
    const scene = (t) => {
      const tau = t - T.impact, sig = sceneTime(t);
      const fade = sstep(T.fade, T.end, t);
      // The drop: free fall; then, joined to the pool by a neck that widens fast, it flattens
      // into the crater it opens, its water spreading out as the crater's lining and its top
      // sinking to just under the crater's floor, until it is simply part of the pool
      const wv = waves.at(sig);
      const [e2f, e3f] = D.mode(Math.min(sig, 0) - D.sRel);
      let dy, e2 = e2f, e3 = e3f, dr = 1;
      if (sig < 0) dy = D.yc0 + D.U * -sig - 0.5 * D.g * sig * sig;
      else {
        e2 = D.e2i - 0.35 * sstep(0, 0.005, sig);
        e3 = D.e3i;
        dr = 1 - sstep(0.0008, 0.0045, sig);                // its water spreads out as the crater's lining...
        // ...its top sinking with it, to just under the crater's floor
        const top = D.yc0 + rd * (1 + D.e2i + D.e3i) - D.U * sig;
        const y = top + (Math.min(top, wv.H[0] - 0.5 * rd) - top) * sstep(0.0012, 0.004, sig);
        dy = y - dr * rd * (1 + e2 + e3);
      }
      const mode = sig < 0 ? 1 : sig < 0.0045 ? 2 : 0;
      // Camera, following the drop down with a slight lag, as an operator would
      const vWall = (D.U + D.g * Math.min(sig, 0)) * R0;      // px per film second
      const elev = (hermite(keys.elev, t) * Math.PI) / 180;
      const dist = Math.exp(hermite(keys.dist, t));
      const lag = 0.035 * vWall;
      const target = tau < 0 ? dy + lag : hermite([[0, D.yc0 + lag, -vWall / 1000], [380, 0, 0]], tau);
      const cam = [0, target + dist * Math.sin(elev), dist * Math.cos(elev)];
      const fwd = [0, -Math.sin(elev), -Math.cos(elev)], up = [0, Math.cos(elev), -Math.sin(elev)];
      // Only where the surface is too steep (for this camera angle) or too high for the quick
      // lookup is it marched as geometry: the crater, its lip, the drop joining the pool
      const steep = 0.5 + 0.7 * sstep(48, 90, (elev * 180) / Math.PI);
      let rb = 0, lo = 0, hi = 0;
      for (let m = 0; m < wv.N; m++) {
        const h = wv.H[m];
        if (Math.abs(wv.S[m]) > steep || Math.abs(h) > 0.5 * rd) rb = m * wv.dR;
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
      if (mode === 2) { rb = Math.max(rb, 1.7 * rd); hi = Math.max(hi, dy + dr * rd * (1 + Math.abs(e2) + Math.abs(e3))); }
      const splash = [Math.min(9 * rd, rb + 1.2 * rd), lo - 0.05 * rd, hi + 0.05 * rd, mode === 2 || rb > 0 ? 1 : 0];
      // The clear water follows just behind the waves
      const rc = sig > SC0 ? vC * (sig - SC0) : -1e4;
      const band = 10 * rd + 0.28 * Math.max(0, rc);
      const clearAll = sstep(T.settle - 100, T.end - 150, t);
      return {
        t, tau, sig, fade, cam, fwd, up, dy, dr, e2, e3, mode, wv, splash, rc, band, clearAll,
        dropLook: 1 - sstep(0.0005, 0.004, sig),            // how much of the merging surface still looks like the drop
        neck: rd * Math.max(0.05, dr * dr) * (0.1 + 1.3 * Math.sqrt(Math.min(1, Math.max(0, sig) / 0.003))),   // (a neck grows as the root of time)
        s: f / cam[1],                                        // page pixels per world unit (looking down)
        calm: sstep(0.045, 0.1, sig),
        expo: sstep(0, 650, t), vig: (light ? 0.1 : 0.35) * (1 - sstep(T.impact, T.impact + 900, t)),
        amb: 0.007 * (1 - fade),
      };
    };

    const draw = (S) => {
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uPx, canvas.width / W);
      gl.uniform2f(U.uC, C.x, C.y);
      gl.uniform1f(U.uF, f);
      gl.uniform3fv(U.uCam, S.cam); gl.uniform3fv(U.uFwd, S.fwd); gl.uniform3fv(U.uUp, S.up);
      gl.uniform1f(U.uSig, S.sig); gl.uniform1f(U.uRd, rd);
      gl.uniform2f(U.uGS, WATER_PHYS.g * rd, WATER_PHYS.sigma * rd ** 3);
      gl.uniform4f(U.uDrop, 0, S.dy, 0, S.mode);
      gl.uniform4f(U.uDropS, rd * S.dr, S.e2, S.e3, S.dropLook);
      gl.uniform1f(U.uNeck, S.neck);
      gl.uniform4fv(U.uSplash, S.splash);
      gl.uniform4f(U.uRev, S.rc, S.band, S.fade, S.clearAll);
      gl.uniform1f(U.uCalm, S.calm);
      gl.uniform1f(U.uExpo, S.expo); gl.uniform1f(U.uAmb, S.amb); gl.uniform1f(U.uVig, S.vig);
      gl.uniform3fv(U.uMurk, bgD);
      gl.uniform4fv(U.uLook, look);
      for (const k in pal) gl.uniform3fv(U[k], pal[k]);
      gl.bindTexture(gl.TEXTURE_2D, profTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S.wv.N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, S.wv.bytes);
      gl.uniform4fv(U.uProfS, S.wv.scale);
      gl.uniform4fv(U.uProfA, ASYM);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // ---- The real page under the water ----
    // Slope of the water at a point, as the shader computes it
    const grad = (x, z) => {
      const r = Math.hypot(x, z) + 1e-3, s = waves.slope(r) * (1 + (ASYM[0] * (x * ASYM[1] + z * ASYM[2])) / Math.hypot(r, ASYM[3]));
      return [(s * x) / r, (s * z) / r];
    };
    let domOn = null;
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    const applyDom = (S) => {
      // (re-asserted every frame: the page's scroll code may reset the hero's visibility)
      hero.style.visibility = nav.style.visibility = "";
      if (S.sig < WAKE) {
        // Under the still-opaque water the page is painted once, in the warm-up before the clock
        // starts (where a pause is never seen), and then left alone until the water clears. It
        // stays at its own size meanwhile: the page's scroll code measures the (pinned) hero
        // when the fonts arrive, and must never find it scaled.
        if (domOn !== "asleep") {
          domOn = "asleep";
          targets.forEach((el) => (el.style.transform = ""));
          hero.style.scale = nav.style.scale = "";
          focus.forEach((el) => { el.style.display = ""; el.style.webkitMaskImage = el.style.maskImage = "linear-gradient(transparent, transparent)"; });
        }
        waterRipple = null;
        return;
      }
      domOn = "awake";
      // The hero background is refracted by the same waves (see initShader in main.js)
      waterRipple = { C, prof: S.wv.bytes, profS: S.wv.scale, profA: ASYM, k: 4 * rd * (1 - S.fade) };
      hero.style.scale = nav.style.scale = S.s.toFixed(4);
      // Depth of field: three blur layers whose clear centres open just behind the waves
      [S.rc - S.band / 2, S.rc, S.rc + S.band / 2].forEach((r, i) => {
        const r0 = Math.max(0, r * S.s), r1 = r0 + S.band * S.s * 0.45;
        const m = `radial-gradient(circle at ${C.x}px ${C.y}px, transparent ${r0.toFixed(1)}px, #000 ${r1.toFixed(1)}px)`;
        focus[i].style.webkitMaskImage = m;
        focus[i].style.maskImage = m;
      });
      // Refraction: each element shifts with the slope of the water above it (averaged over
      // its area, so fine ripples make a large letter shimmer rather than jump) and stretches
      // with the water's curvature, like the floor of a pool seen through waves
      const KR = 4 * rd * (1 - S.fade), KJ = 0.32 * rd * (1 - S.fade);
      items.forEach((it) => {
        const ox = Math.max(2, it.hw * 0.6), oz = Math.max(2, it.hh * 0.6);
        const c = grad(it.x, it.z), l = grad(it.x - ox, it.z), r = grad(it.x + ox, it.z), u = grad(it.x, it.z - oz), d = grad(it.x, it.z + oz);
        const gx = (2 * c[0] + l[0] + r[0] + u[0] + d[0]) / 6, gz = (2 * c[1] + l[1] + r[1] + u[1] + d[1]) / 6;
        const hxx = (r[0] - l[0]) / (2 * ox), hzz = (d[1] - u[1]) / (2 * oz), hxz = (d[0] - u[0]) / (2 * oz);
        const a = 1 - clamp(KJ * hxx, 0.12), dd = 1 - clamp(KJ * hzz, 0.12), b = -clamp(KJ * hxz, 0.08);
        const tx = clamp(-KR * gx, rd), tz = clamp(-KR * gz, rd);
        it.el.style.transform = `matrix(${a.toFixed(4)},${b.toFixed(4)},${b.toFixed(4)},${dd.toFixed(4)},${tx.toFixed(2)},${tz.toFixed(2)})`;
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
      waterRipple = null;
    };
    const cleanup = () => {
      resetDom();
      removeEventListener("resize", onResize);
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach((n) => removeEventListener(n, skip));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };

    // Draw the first frame now: the browser compiles the shader on first use, and that pause
    // belongs here, before the clock starts, not in the middle of the fade-in
    render(0);

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
    const times = [], cpu = [];
    const finish = () => {
      if (done) return;
      done = true;
      if (perf && times.length) {
        const stat = (name, f) => {
          const s = times.filter(f).map((x) => x[1]).sort((a, b) => a - b);
          if (s.length) console.log(`${name}: frames ${s.length}, median ${s[s.length >> 1].toFixed(1)}ms, p90 ${s[Math.floor(s.length * 0.9)].toFixed(1)}ms, max ${s[s.length - 1].toFixed(1)}ms`);
        };
        stat("intro all", (x) => x[0] > 100);
        stat("  before impact", (x) => x[0] > 100 && x[0] < T.impact);
        stat("  splash", (x) => x[0] >= T.impact && x[0] < T.impact + 1100);
        stat("  reveal", (x) => x[0] >= T.impact + 1100);
        const c = cpu.sort((a, b) => a - b);
        if (c.length) console.log(`script per frame (scene, waves, page): median ${c[c.length >> 1].toFixed(2)}ms, p90 ${c[Math.floor(c.length * 0.9)].toFixed(2)}ms, max ${c[c.length - 1].toFixed(2)}ms`);
        console.log(`render scale ${pxScale}; long frames at ${times.filter((x) => x[1] > 45).map((x) => `${x[0].toFixed(0)}ms (${x[1].toFixed(0)})`).join(", ") || "none"}`);
      }
      cleanup();
      resolve(true);
    };
    setTimeout(finish, 12000);                                 // never block the page
    let warm = 0, warmFrom = 0;
    const frame = (now) => {
      if (done) return;
      // Hold the first frame until frames arrive at a steady pace (the GPU finishes preparing
      // the shader on the first one or two), so the clock never jumps
      if (!start) {
        const steady = last && now - last < 34;
        last = now;
        warmFrom ||= now;
        if (!steady && ++warm < 10 && now - warmFrom < 600) { render(0); requestAnimationFrame(frame); return; }
        start = now;
      }
      if (last && last !== start) {
        const dt = now - last;
        times.push([now - start, dt]);
        // Too slow for this device? Render fewer pixels (the scene is soft enough to take it).
        // Checked all the way through, since the splash costs more than the opening.
        // (First after 8 frames, then every 20: a very slow device may only manage a dozen)
        if (times.length % 20 === 0 || times.length === 8) {
          const s = times.slice(-20).map((x) => x[1]).sort((a, b) => a - b), med = s[s.length >> 1];
          // Under ~22 fps, or under ~28 at the lowest resolution: this device can't carry the
          // scene, so the water fades away now (as if skipped) and the rest of the site runs lighter
          if ((med > 45 || (med > 36 && pxScale <= 0.6)) && !skipAt) { skipAt = now; onStruggle && onStruggle(); }
          else if (med > 20 && pxScale > 0.6) { pxScale = Math.max(0.6, pxScale * (med > 30 ? 0.7 : 0.85)); resize(); }
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
      const c0 = perf ? performance.now() : 0;
      render(t);
      if (perf) cpu.push(performance.now() - c0);
      if (t >= T.end) { finish(); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
