/* ---------- Intro: a drop of water creates the site ----------
   Plays once per visitor (intro() in main.js decides when). A single WebGL fragment shader
   ray-traces a small scene in the site's own palette while the real page waits under water:

   1. A drop hangs above a still, dark surface, seen from the side, in a softly lit studio
      whose lights and walls it reflects and refracts (upside down, as real water does).
   2. It falls under gravity; the camera cranes up as it goes.
   3. On contact the drop joins the surface through a smooth liquid neck and sinks into the
      crater it opens. A small crown rises and falls, the crater collapses into a rebound
      jet, and ripples spread out: real capillary-gravity waves (short ripples lead, longer
      ones follow, a calm circle opens behind them), bending the reflections as they pass.
   4. Wherever the waves have passed, the water clears: the page comes into focus (layered
      backdrop blurs), every element is refracted by the ripples (CSS transforms on the real
      HTML), the hero background bends with them (main.js), light catches the page in
      caustics, and the camera settles at exactly the page's scale. The ripples die away and
      the overlay leaves nothing but the normal page.

   World units are CSS pixels of the final view, so the water and the page line up exactly.
   waterIntro() resolves true when it has played, false if it couldn't run (no WebGL, shader
   error), in which case main.js falls back to its short reveal. */

const WATER_T = { fall: 900, impact: 1900, settle: 3600, fade: 3350, end: 4250 }; // ms
const WATER_LAG = 380; // the water clears this long after the wave has passed (ms)

const v3 = {
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; },
  glsl: (a) => `vec3(${a.map((x) => x.toFixed(5)).join(",")})`,
};
// Studio lights (directions from the scene): a round softbox above-left of the first camera,
// and four small lights far away on the horizon behind the drop, out of focus
const WATER_KEY = v3.norm([-0.55, 0.62, 0.56]);
const WATER_BOKEH = [[-0.47, 0.022, 0.011, 0.9], [-0.2, 0.05, 0.008, 0.55], [0.27, 0.018, 0.012, 0.8], [0.58, 0.04, 0.009, 0.5]]
  .map(([az, el, size, k]) => ({ dir: v3.norm([Math.sin(az), el, -Math.cos(az)]), size, k }));

// Ripples from the impact, shared with the hero background (main.js), which they refract too.
// Deep-water capillary-gravity waves from a point impulse, by stationary phase: at distance r
// after time t the surface carries the wavenumber whose group velocity is r/t. So short
// capillary ripples run ahead, longer ones follow, and a calm circle opens behind them.
const WATER_RIPPLE = `
uniform vec4 uDisp;      // gravity, surface tension, viscosity, wavenumber of the slowest group
uniform vec4 uSpec;      // spectrum peak, slowest group speed (calm edge), fastest drawn speed, curvature floor
uniform vec4 uSrc[2];    // sources: x, z, age (s), amplitude
float groupV(float k, out float w, out float d2) {
  w = sqrt(uDisp.x * k + uDisp.y * k * k * k);
  float cg = (uDisp.x + 3. * uDisp.y * k * k) / (2. * w);
  d2 = (3. * uDisp.y * k - cg * cg) / w;   // how fast the group speed changes with k
  return cg;
}
vec4 wave(vec2 p) {      // height, slope x, slope z, curvature
  vec4 o = vec4(0.);
  for (int i = 0; i < 2; i++) {
    vec4 S = uSrc[i];
    if (S.w == 0. || S.z <= 0.) continue;
    vec2 d = p - S.xy;
    float r = length(d) + .01, t = S.z, v = r / t;
    if (v < uSpec.y || v > uSpec.z) continue;
    float w, d2, cg, k = max(1.05 * uDisp.w, v * v / (2.25 * uDisp.y));
    for (int j = 0; j < 3; j++) { cg = groupV(k, w, d2); k = max(1.02 * uDisp.w, k - (cg - v) / max(d2, uSpec.w)); }
    cg = groupV(k, w, d2);
    vec2 u = d / r;
    float org = 1. + .09 * (3. * u.y - 4. * u.y * u.y * u.y) + .06 * (u.x * u.x - u.y * u.y); // never a perfect circle
    float q = k / uSpec.x;
    float a = S.w * org * smoothstep(uSpec.y, 1.15 * uSpec.y, v) * q * q * exp(1. - q * q)
            * sqrt(k / max(d2, uSpec.w)) * pow(r * max(t, .12), -.32) * exp(-2. * uDisp.z * k * k * t);
    float ph = k * r - w * t + .785;
    float h = a * cos(ph), dh = -a * k * sin(ph);
    o += vec4(h, dh * u, -k * k * h);
  }
  return o;
}`;

const WATER_VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const WATER_FRAG = `
precision highp float;
uniform vec2 uRes;       // drawing buffer size
uniform float uPx;       // drawing-buffer pixels per CSS pixel
uniform vec2 uC;         // where the impact point sits on screen (CSS px)
uniform float uF;        // focal length (CSS px)
uniform vec3 uCam, uFwd, uUp;
uniform float uT, uRd;   // time (ms), drop radius
uniform vec4 uDrop;      // drop centre; w: 1 = falling, 2 = merging into the surface, 0 = gone
uniform vec3 uDropAx;    // horizontal, vertical semi-axes; how much the merging drop still looks like itself
uniform vec4 uCrown;     // crown radius, height, width; crater depth
uniform vec2 uJet;       // jet height, width
uniform vec4 uRev;       // clear-water radius, band width, effects fade, final clear
uniform float uCalm;     // 0 while the splash is busy, 1 once it has settled
uniform float uExpo, uAmb, uVig, uSplash;
uniform vec3 uMurk;      // the water body, in display colour (= the page background)
uniform vec3 uSkyTop, uSkyHor, uGlow, uKey, uStrip, uFill, uDeep, uCau, uBokeh;
uniform vec4 uLook;      // light theme: lights become dark flags (glow, strips); slope shading; murk variation
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

// A light arching from the far horizon up and over the water, of half-width w: a narrow
// tube with crisp edges (real lights have them, so ripples break its reflection into sharp
// broken lines), or a broad, dim softbox for a gentle sheen
float strip(vec3 d, float w) {
  float x = d.x * .985 - d.z * .17 - .12;       // a little to one side and turned, as a real rig would be
  return smoothstep(w, w * .7, abs(x)) * smoothstep(.4, .55, d.y) * smoothstep(.5, .2, d.z);
}
float bokeh(vec3 d, vec4 b) { float c = dot(d, b.xyz); return smoothstep(cos(b.w * 1.3), cos(b.w * .75), c); }

// The studio around the water, in the page's colours: walls that are never perfectly even,
// a thin line of warm light on the horizon with a few distant lights on it, a round softbox
// for the drop's highlight, two long strips overhead and a soft fill behind the first camera
vec3 sky(vec3 d) {
  float y = d.y;
  vec3 col = mix(uSkyHor, uSkyTop, smoothstep(0., .35, y));
  col *= .82 + .36 * vnoise(d * 2.6 + 3.1);
  float az = atan(d.x, -d.z);
  float gy = (y - .006) / .009;
  // On the dark set these are lights; on the light set they are dark flags (uLook.x/y > 0)
  float gm = exp(-az * az * 3. - gy * gy) * 1.6 + .03 * exp(-az * az * 1.2 - y * y * 900.);
  col = col * (1. - min(gm, 1.) * uLook.x) + uGlow * gm;
  float bk = bokeh(d, BK0) * ${WATER_BOKEH[0].k.toFixed(2)} + bokeh(d, BK1) * ${WATER_BOKEH[1].k.toFixed(2)}
           + bokeh(d, BK2) * ${WATER_BOKEH[2].k.toFixed(2)} + bokeh(d, BK3) * ${WATER_BOKEH[3].k.toFixed(2)};
  col = col * (1. - min(bk, 1.) * uLook.x) + uBokeh * bk;
  float kd = dot(d, KC);
  col += uKey * smoothstep(.968, .984, kd) * (.7 + .3 * smoothstep(.984, .997, kd));
  float sm = strip(d, .045) + .05 * strip(d, .42);
  col = col * (1. - min(sm, 1.) * uLook.y) + uStrip * sm;
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

// A perfectly flat mirror never looks like water: three faint slow swells, and finer ripples
// from the air in the room that only show where the surface mirrors something bright
vec3 amb(vec2 p) {
  float t = uT * .001;
  vec2 d1 = vec2(.8, .6), d2 = vec2(-.44, .898), d3 = vec2(.17, -.985);
  vec2 d4 = vec2(.94, -.34), d5 = vec2(-.7, -.714), d6 = vec2(.31, .95);
  float k1 = 6.2832 / (11. * uRd), k2 = 6.2832 / (6.3 * uRd), k3 = 6.2832 / (16. * uRd);
  float k4 = 6.2832 / (2.1 * uRd), k5 = 6.2832 / (1.6 * uRd), k6 = 6.2832 / (2.7 * uRd);
  float a1 = dot(p, d1) * k1 - t * 1.1, a2 = dot(p, d2) * k2 + t * 1.6, a3 = dot(p, d3) * k3 - t * .8;
  float a4 = dot(p, d4) * k4 - t * 3.3, a5 = dot(p, d5) * k5 + t * 2.9, a6 = dot(p, d6) * k6 - t * 2.4;
  float A = uAmb * uRd, B = A * .12;
  return A * vec3(sin(a1) + .35 * sin(a2) + .8 * sin(a3), cos(a1) * k1 * d1 + .35 * cos(a2) * k2 * d2 + .8 * cos(a3) * k3 * d3)
       + B * vec3(sin(a4) + sin(a5) + sin(a6), cos(a4) * k4 * d4 + cos(a5) * k5 * d5 + cos(a6) * k6 * d6);
}

// Crown, crater and rebound jet around the impact
float crownH(vec2 p) {
  float x = (length(p) - uCrown.x) / uCrown.z;
  float an = atan(p.y, p.x);
  return uCrown.y * exp(-x * x) * (1. + .06 * sin(an * 11. + 1.7) + .05 * sin(an * 7. - .6) + .04 * sin(an * 17. + 2.9));
}
float jetH(vec2 p) { return uJet.x * exp(-dot(p, p) / (uJet.y * uJet.y)); }
float splashH(vec2 p) { return crownH(p) + jetH(p) - uCrown.w * exp(-dot(p, p) / (1.8 * uRd * uRd)); }

vec3 dropAxes() { return vec3(uDropAx.x, uDropAx.y, uDropAx.x); }
float sdDrop(vec3 p) { vec3 a = dropAxes(); return (length((p - uDrop.xyz) / a) - 1.) * min(a.x, a.y); }
float smin(float a, float b, float k) { float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
// The surface around the impact. While the drop merges, it joins the water through a smooth
// neck instead of simply touching it, the way two bodies of liquid coalesce.
float field(vec3 p) {
  float w = p.y - splashH(p.xz);
  return uDrop.w > 1.5 ? smin(w, sdDrop(p), .45 * uRd) : w;
}
vec3 fieldN(vec3 p) {
  vec2 e = vec2(.05 * uRd, 0.);
  return normalize(vec3(field(p + e.xyy) - field(p - e.xyy), field(p + e.yxy) - field(p - e.yxy), field(p + e.yyx) - field(p - e.yyx)));
}

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
  if (!hitEll(p + t1 * .002, t1, c, ax, a0, a1)) return t1;   // (in the neck while merging)
  vec3 p2 = p + t1 * a1;
  vec3 n2 = nEll(p2, c, ax);
  vec3 t2 = refract(t1, -n2, eta);
  if (dot(t2, t2) < .5) {
    vec3 tb = reflect(t1, -n2);
    if (!hitEll(p2 + tb * .002, tb, c, ax, a0, a1)) return tb;
    vec3 p3 = p2 + tb * a1;
    vec3 n3 = nEll(p3, c, ax);
    t2 = refract(tb, -n3, eta);
    if (dot(t2, t2) < .5) t2 = reflect(tb, -n3);
  }
  return t2;
}
// A drop of water: Fresnel reflection of the room plus the room seen through it, upside down
// and magnified. Water is clear (no glassy tint); the hero drop splits the colours very
// slightly, as real water does.
vec3 dropShade(vec3 p, vec3 n, vec3 rd, bool disperse) {
  vec3 c = uDrop.xyz, ax = dropAxes();
  float F = fres(clamp(dot(-rd, n), 0., 1.));
  vec3 col = env(reflect(rd, n)) * F, tr;
  if (disperse) {
    tr.r = env(through(p, refract(rd, n, 1. / 1.330), c, ax, 1.330)).r;
    tr.g = env(through(p, refract(rd, n, 1. / 1.333), c, ax, 1.333)).g;
    tr.b = env(through(p, refract(rd, n, 1. / 1.338), c, ax, 1.338)).b;
  } else tr = env(through(p, refract(rd, n, 1. / 1.333), c, ax, 1.333));
  return col + tr * (1. - F) * .97;
}

// Find the surface inside a cylinder around the impact (the splash, and the drop while it
// merges). The ripples are shading only, everywhere, so the two meet without a seam.
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
  float dt = (tmax - tmin) / 44.;
  float tp = tmin;
  for (int i = 1; i <= 44; i++) {
    float t = tmin + dt * float(i);
    if (field(ro + rd * t) < 0.) {
      float lo = tp, hi = t;
      for (int j = 0; j < 6; j++) {
        float m = .5 * (lo + hi);
        if (field(ro + rd * m) < 0.) hi = m; else lo = m;
      }
      hit = ro + rd * hi;
      return true;
    }
    tp = t;
  }
  return false;
}

// The water surface: reflection on top, the page (or deep water) underneath. Thin raised
// water (the crown, the jet) is seen through, bending the view of the water behind it.
vec4 water(vec3 p, vec3 n, vec3 rd, vec4 wv, float sheet) {
  float F0 = fres(clamp(dot(-rd, n), 0., 1.)) * (1. - uRev.z);
  vec3 rr = reflect(rd, n);
  rr.y = abs(rr.y);
  vec3 L;
  float t0, t1;
  vec3 dax = dropAxes();
  if (uDrop.w > .5 && uDrop.w < 1.5 && hitEll(p, rr, uDrop.xyz, dax, t0, t1) && t0 > 0.) L = dropShade(p + rr * t0, nEll(p + rr * t0, uDrop.xyz, dax), rr, false);
  else L = env(rr);
  // The water clears behind the wave; crests carry the edge forward a little
  float r = length(p.xz) - 20. * wv.x;
  float clear = smoothstep(uRev.x + .5 * uRev.y, uRev.x - .5 * uRev.y, r);
  clear *= mix(smoothstep(3.5 * uRd, 6.5 * uRd, length(p.xz)), 1., uCalm);   // not through the busy splash
  clear = max(clear, uRev.w);
  // Where the page shows through, its own light outshines the reflections
  float F = F0 * mix(1., .015, clear);
  // Ripples focus light onto the page beneath
  float cau = pow(clamp(-wv.w * uRd * 5., 0., 1.), 1.6) * 1.6 * clear * (1. - uRev.z);
  // The water body: faintly shaded by its slopes, with a soft unevenness in its depth that
  // the waves bend (refraction), so it is never one flat colour
  float depth = 1. + uLook.w * (vnoise(vec3((p.xz + 6. * uRd * wv.yz) / (9. * uRd), 1.7)) - .5);
  vec3 body = pow(uMurk, vec3(2.2)) * depth * (1. + uLook.z * dot(n.xz, vec2(.32, -.95)));
  if (sheet > 0.) body = mix(body, env(normalize(rd - n * .3)) * .9, sheet);   // thin water: seen through
  // Reflection and the water beneath add up as light (Fresnel-weighted) before the tone curve.
  // Where the water has cleared, only the reflection remains, over the page.
  float k = mix(1. - clear, 1., sheet);
  vec3 rgb = k * tone(L * F + (1. - F) * body) + (1. - k) * tone(L * F) + cau * uCau * (1. - F);
  float al = k + (1. - k) * F;
  al = max(al, max(rgb.r, max(rgb.g, rgb.b)));
  return vec4(rgb, min(al, 1.));
}

vec4 trace(vec3 ro, vec3 rd) {
  vec3 dax = dropAxes();
  float t0, t1;
  float tD = 1e9;
  if (uDrop.w > .5 && uDrop.w < 1.5 && hitEll(ro, rd, uDrop.xyz, dax, t0, t1) && t0 > 0.) tD = t0;
  vec3 pW = vec3(0.);
  float tW = 1e9;
  bool marched = false;
  if (uSplash > 0. && marchSplash(ro, rd, pW)) { tW = dot(pW - ro, rd); marched = true; }
  else if (rd.y < 0.) { tW = -ro.y / rd.y; pW = ro + rd * tW; }

  if (tD < tW) { vec3 p = ro + rd * tD; return vec4(tone(dropShade(p, nEll(p, uDrop.xyz, dax), rd, true)), 1.); }
  if (tW < 1e8) {
    vec4 wv = wave(pW.xz);
    vec3 am = amb(pW.xz) * exp(-tW / (90. * uRd));
    vec2 g = wv.yz + am.yz;
    vec3 n;
    float sheet = 0., drop = 0.;
    if (marched) {
      vec3 ns = fieldN(pW);
      n = normalize(ns + vec3(-g.x, 0., -g.y) * max(ns.y, 0.));
      // the thin rim of the crown and the tip of the jet are seen through
      float ch = crownH(pW.xz) / max(uCrown.y, 1e-3);
      sheet = max(.35 * smoothstep(.15, .5, ch) + .65 * smoothstep(.6, .95, ch), smoothstep(.6, .95, jetH(pW.xz) / max(uJet.x, 1e-3)));
      sheet *= sqrt(1. - abs(dot(rd, n)));
      if (uDrop.w > 1.5) drop = uDropAx.z * clamp(.5 + .5 * (pW.y - splashH(pW.xz) - sdDrop(pW)) / (.45 * uRd), 0., 1.);
    } else n = normalize(vec3(-g.x, 1., -g.y));
    vec4 c = water(pW, n, rd, wv, sheet);
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

// The ripples' state for the current frame, read by the hero background (main.js) so it is
// refracted by the same waves; null when no intro is playing
let waterRipple = null;

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
    ["uRes", "uPx", "uC", "uF", "uCam", "uFwd", "uUp", "uT", "uRd", "uDrop", "uDropAx", "uDisp", "uSpec", "uSrc", "uCrown", "uJet", "uCalm",
      "uRev", "uExpo", "uAmb", "uVig", "uSplash", "uMurk", "uSkyTop", "uSkyHor", "uGlow", "uKey", "uStrip", "uFill", "uDeep", "uCau", "uBokeh", "uLook"]
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
      uSkyTop: mul(bg, 0.92), uSkyHor: bg, uGlow: mul(acc, 0.5), uKey: [1.8, 1.77, 1.7], uBokeh: mul(fg, 2),
      uStrip: mul(fg, 1.5), uFill: mul(bg, 0.25), uDeep: mul(bg, 0.55), uCau: [0.03, 0.025, 0.02],
    } : {
      uSkyTop: mul(bg, 0.75), uSkyHor: add(mul(bg, 1.7), mul(acc, 0.002)), uGlow: add(mul(acc, 1.3), mul(fg, 0.1)),
      uKey: mul(fg, 11), uBokeh: mul(add(mul(acc, 0.6), mul(fg, 0.4)), 1.4), uStrip: mul(add(mul(fg, 0.65), mul(acc, 0.35)), 8),
      uFill: mul(add(mul(fg, 0.5), mul(acc, 0.5)), 0.25), uDeep: mul(bg, 0.9), uCau: [0.07, 0.06, 0.04],
    };
    // flags instead of lights; slope shading; how uneven the water body is
    const look = light ? [0.8, 0.75, 1.1, 0.05] : [0, 0, 0.8, 0.22];

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
      // 30° vertical field of view, widened on tall screens so the scene keeps its proportions
      f = Math.min(H / (2 * Math.tan((30 * Math.PI) / 360)), W / (2 * Math.tan((20 * Math.PI) / 360)));
      const m = Math.min(W, H);
      rd = (10 * m) / 800;                                  // drop radius
      reach = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - C.x, y - C.y)));
      items = targets.map((el) => {
        const r = el.getBoundingClientRect();
        return r.width || r.height ? { el, x: r.left + r.width / 2 - C.x, z: r.top + r.height / 2 - C.y, hw: r.width / 2, hh: r.height / 2 } : null;
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

      // The drop: a near sphere held by surface tension, still ringing gently from when it
      // formed; it falls under gravity, a little flattened by the air, and touches at impact
      const shape = (t) => {
        const fall = sstep(T.fall, T.impact, t);
        const k = 1 + 0.07 * Math.exp(-t / 1500) * Math.sin((2 * Math.PI * t) / 280)
          + 0.02 * fall * Math.sin((2 * Math.PI * t) / 210) + 0.025 * fall * fall;
        return [rd * k, rd / (k * k)];                       // volume stays the same
      };
      const bImp = shape(T.impact)[1], y0 = 6 * rd, fallT = T.impact - T.fall;
      const g = (2 * (y0 - bImp)) / (fallT * fallT), vImp = g * fallT;
      drop = { shape, bImp, y0, g, vImp };

      // Ripples: capillary-gravity waves on deep water, scaled so that their leading edge
      // stays ahead of the clearing water, which must reach the farthest corner by the time
      // the camera settles
      const vClear = (reach + 5 * rd) / 0.86 / ((T.settle - T.impact - WATER_LAG) / 1000);    // px/s
      const km = (2 * Math.PI) / (3.4 * rd), ks = 1.5 * km;  // slowest phase speed; peak of the spectrum
      const ratio = (x) => Math.sqrt((1 / x + x) / 2) * (1 + 3 * x * x) / (2 * (1 + x * x));
      const cm = (1.15 * vClear) / ratio(2.6);
      const gr = (km * cm * cm) / 2, st = (cm * cm) / (2 * km), nu = 0.08 / (km * km);
      const disp = (k) => { const w = Math.sqrt(gr * k + st * k ** 3), cg = (gr + 3 * st * k * k) / (2 * w); return { w, cg, d2: (3 * st * k - cg * cg) / w }; };
      let lo = 0.05 * km, hi = 2 * km;                       // slowest group velocity: the calm circle's edge
      for (let i = 0; i < 60; i++) { const a = hi - (hi - lo) / 1.618, b = lo + (hi - lo) / 1.618; if (disp(a).cg < disp(b).cg) hi = b; else lo = a; }
      const kMin = (lo + hi) / 2, cgMin = disp(kMin).cg, d2f = 0.15 * disp(ks).d2, vCut = disp(2.6 * ks).cg;
      const ripple = (dx, dz, t, A) => {                     // the shader's wave(), for the page's elements
        const r = Math.hypot(dx, dz) + 0.01, v = r / t;
        if (t <= 0 || v < cgMin || v > vCut) return null;
        let k = Math.max(1.05 * kMin, (v * v) / (2.25 * st)), D;
        for (let j = 0; j < 3; j++) { D = disp(k); k = Math.max(1.02 * kMin, k - (D.cg - v) / Math.max(D.d2, d2f)); }
        D = disp(k);
        const ux = dx / r, uz = dz / r, qk = k / ks;
        const org = 1 + 0.09 * (3 * uz - 4 * uz ** 3) + 0.06 * (ux * ux - uz * uz);
        const a = A * org * sstep(cgMin, 1.15 * cgMin, v) * qk * qk * Math.exp(1 - qk * qk)
          * Math.sqrt(k / Math.max(D.d2, d2f)) * Math.pow(r * Math.max(t, 0.12), -0.32) * Math.exp(-2 * nu * k * k * t);
        const ph = k * r - D.w * t + 0.785;
        return { h: a * Math.cos(ph), s: -a * k * Math.sin(ph), ux, uz, slope: a * k };
      };
      let steep = 0;                                         // normalise: steepest slope 0.32 a moment after impact
      for (let r = 1; r < 6 * rd + 0.2 * vCut; r += 0.5) { const w = ripple(r, 0, 0.12, 1); if (w) steep = Math.max(steep, w.slope); }
      const A = 0.32 / Math.max(steep, 1e-6);

      // The rebound jet rises from the collapsing crater and falls back, sending out a second,
      // gentler set of ripples
      const jet = { t0: 270, dur: 470, h: 2.3 * rd };
      const jetH = (tau) => { const x = (tau - jet.t0) / jet.dur; return x > 0 && x < 1 ? jet.h * Math.pow(Math.sin(Math.PI * x), 1.5) : 0; };
      const crownR = (tau) => rd * (0.95 + 1.9 * (1 - Math.exp(-tau / 150)));
      P = { jet, jetH, crownR, ripple, vClear, A, disp: [gr, st, nu, kMin], spec: [ks, cgMin, vCut, d2f] };
      resize();
    };
    let pxScale = Math.min(devicePixelRatio || 1, 1.25);
    const resize = () => {
      canvas.width = Math.round(W * pxScale);
      canvas.height = Math.round(H * pxScale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    // ---- Everything in the scene at time t (ms) ----
    const src = new Float32Array(8);
    const scene = (t) => {
      const tau = t - T.impact;
      const fade = sstep(T.fade, T.end, t);
      // Camera
      const elev = (hermite(keys.elev, t) * Math.PI) / 180;
      const dist = Math.exp(hermite(keys.dist, t));
      let dy;
      if (t < T.fall) dy = drop.y0 + 0.06 * rd * (1 - Math.cos((2 * Math.PI * t) / T.fall)) * 0.5;
      else if (tau <= 0) dy = drop.y0 - 0.5 * drop.g * (t - T.fall) ** 2;
      else dy = drop.bImp - drop.vImp * tau + 0.5 * (drop.vImp / 600) * tau * tau; // slows in the water
      const target = tau < 0 ? dy : hermite([[0, drop.bImp, -drop.vImp], [380, 0, 0]], tau);
      const cam = [0, target + dist * Math.sin(elev), dist * Math.cos(elev)];
      const fwd = [0, -Math.sin(elev), -Math.cos(elev)], up = [0, Math.cos(elev), -Math.sin(elev)];
      // The drop: falling on its own, then merging (joined to the surface, it sinks into the
      // crater and mixes into the pool, becoming the same water), then part of the pool
      let [ax, ay] = drop.shape(Math.min(t, T.impact));
      const mix = 1 - 0.65 * sstep(60, 250, tau);
      ax *= mix; ay *= mix;
      const mode = tau < -45 ? 1 : tau < 260 ? 2 : 0;
      // Splash
      const bump = (x, p) => (x <= 0 ? 0 : (x / p) * Math.exp(1 - x / p));
      const crown = tau > 0 ? [P.crownR(tau), rd * 1.3 * bump(tau, 130), rd * 0.2 * (1 + tau / 600), rd * 1.45 * bump(tau, 160) * (1 - sstep(280, 460, tau))] : [rd, 0, rd, 0];
      const jx = (tau - P.jet.t0) / P.jet.dur;
      const jet = [P.jetH(tau), rd * (0.42 + 0.25 * Math.min(1, Math.max(0, jx)))];
      // Ripples: the impact, then the jet falling back
      const age = tau / 1000, age2 = (tau - P.jet.t0 - P.jet.dur) / 1000;
      const ramp = (a) => sstep(0, 0.09, a) * (1 - fade);
      src.set([0, 0, age, age > 0 ? P.A * ramp(age) : 0, 0, 0, age2, age2 > 0 ? 0.3 * P.A * ramp(age2) : 0]);
      // The clear water follows where the wave was a moment ago
      const rc = tau > WATER_LAG ? (P.vClear * (tau - WATER_LAG)) / 1000 : -1e4;
      const band = 10 * rd + 0.28 * Math.max(0, rc);
      const clearAll = sstep(T.settle - 100, T.end - 150, t);
      return {
        t, tau, fade, cam, fwd, up, dy, ax, ay, mode, crown, jet, rc, band, clearAll,
        dropLook: 1 - sstep(40, 170, tau),                    // how much of the merged surface still looks like the drop
        s: f / cam[1],                                        // page pixels per world unit (looking down)
        splash: tau > -45 && tau < 1100 ? 1 : 0,
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
      gl.uniform4f(U.uDrop, 0, S.dy, 0, S.mode);
      gl.uniform3f(U.uDropAx, S.ax, S.ay, S.dropLook);
      gl.uniform4fv(U.uDisp, P.disp); gl.uniform4fv(U.uSpec, P.spec); gl.uniform4fv(U.uSrc, src);
      gl.uniform4fv(U.uCrown, S.crown); gl.uniform2fv(U.uJet, S.jet); gl.uniform1f(U.uCalm, S.calm);
      gl.uniform4f(U.uRev, S.rc, S.band, S.fade, S.clearAll);
      gl.uniform1f(U.uExpo, S.expo); gl.uniform1f(U.uAmb, S.amb); gl.uniform1f(U.uVig, S.vig); gl.uniform1f(U.uSplash, S.splash);
      gl.uniform3fv(U.uMurk, bgD);
      gl.uniform4fv(U.uLook, look);
      for (const k in pal) gl.uniform3fv(U[k], pal[k]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // ---- The real page under the water ----
    // Slope of the water at a point (both ripple sources), as the shader computes it
    const grad = (x, z) => {
      let gx = 0, gz = 0;
      for (let i = 0; i < 2; i++) {
        if (!src[i * 4 + 3]) continue;
        const w = P.ripple(x - src[i * 4], z - src[i * 4 + 1], src[i * 4 + 2], src[i * 4 + 3]);
        if (w) { gx += w.s * w.ux; gz += w.s * w.uz; }
      }
      return [gx, gz];
    };
    let domOn = null;
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    const applyDom = (S) => {
      const on = S.tau > WATER_LAG - 120;
      // (re-asserted every frame: the page's scroll code may reset the hero's visibility)
      hero.style.visibility = nav.style.visibility = on ? "" : "hidden";
      if (on !== domOn) {
        domOn = on;
        focus.forEach((el) => (el.style.display = on ? "" : "none"));
      }
      // The hero background is refracted by the same ripples (see initShader in main.js)
      waterRipple = on ? { C, disp: P.disp, spec: P.spec, src, k: 4 * rd } : null;
      if (!on) return;
      hero.style.scale = nav.style.scale = S.s.toFixed(4);
      // Depth of field: three blur layers whose clear centres open just behind the wave
      [S.rc - S.band / 2, S.rc, S.rc + S.band / 2].forEach((r, i) => {
        const r0 = Math.max(0, r * S.s), r1 = r0 + S.band * S.s * 0.45;
        const m = `radial-gradient(circle at ${C.x}px ${C.y}px, transparent ${r0.toFixed(1)}px, #000 ${r1.toFixed(1)}px)`;
        focus[i].style.webkitMaskImage = m;
        focus[i].style.maskImage = m;
      });
      // Refraction: each element shifts with the slope of the water above it (averaged over
      // its area, so fine ripples make a large letter shimmer rather than jump) and stretches
      // with the water's curvature, like the floor of a pool seen through ripples
      const KR = 4 * rd, KJ = 0.32 * rd;
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
    const times = [];
    const finish = () => {
      if (done) return;
      done = true;
      if (perf && times.length) {
        const stat = (name, f) => {
          const s = times.filter(f).map((x) => x[1]).sort((a, b) => a - b);
          if (s.length) console.log(`${name}: frames ${s.length}, median ${s[s.length >> 1].toFixed(1)}ms, p90 ${s[Math.floor(s.length * 0.9)].toFixed(1)}ms, max ${s[s.length - 1].toFixed(1)}ms`);
        };
        stat("intro all", (x) => x[0] > 100);
        stat("  before impact", (x) => x[0] > 100 && x[0] < T.impact - 45);
        stat("  splash", (x) => x[0] >= T.impact - 45 && x[0] < T.impact + 1100);
        stat("  reveal", (x) => x[0] >= T.impact + 1100);
        console.log(`render scale ${pxScale}; long frames at ${times.filter((x) => x[1] > 45).map((x) => `${x[0].toFixed(0)}ms (${x[1].toFixed(0)})`).join(", ") || "none"}`);
      }
      cleanup();
      resolve(true);
    };
    setTimeout(finish, 12000);                                 // never block the page
    let warm = 0;
    const frame = (now) => {
      if (done) return;
      // Hold the first frame until frames arrive at a steady pace (the GPU finishes preparing
      // the shader on the first one or two), so the clock never jumps
      if (!start) {
        const steady = last && now - last < 34;
        last = now;
        if (!steady && ++warm < 10) { render(0); requestAnimationFrame(frame); return; }
        start = now;
      }
      if (last && last !== start) {
        const dt = now - last;
        times.push([now - start, dt]);
        // Too slow for this device? Render fewer pixels (the scene is soft enough to take it).
        // Checked all the way through, since the splash costs more than the opening.
        if (times.length % 20 === 0) {
          const s = times.slice(-20).map((x) => x[1]).sort((a, b) => a - b), med = s[10];
          if (med > 20 && pxScale > 0.6) { pxScale = Math.max(0.6, pxScale * (med > 30 ? 0.7 : 0.85)); resize(); }
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
