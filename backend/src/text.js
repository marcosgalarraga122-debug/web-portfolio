/* Plain-text helpers with no I/O: language detection, retrieval from the knowledge base,
   topic and enquiry tagging, and the output filter. Kept pure so they can be unit-tested. */
import { CONTACT, ENTRIES } from "./knowledge.js";

export const LANGS = ["en", "es", "fr"];

const STOP = {
  en: ["the", "and", "is", "are", "you", "your", "my", "what", "how", "can", "do", "does", "i", "to", "of", "for", "with", "much", "have", "it", "website", "need", "want", "would", "could", "hello", "hi", "thanks", "please", "about", "our", "we"],
  es: ["el", "la", "los", "las", "que", "qué", "de", "y", "es", "mi", "tu", "cómo", "como", "puedes", "una", "un", "para", "web", "página", "cuánto", "cuanto", "cuesta", "tengo", "negocio", "quiero", "hola", "gracias", "necesito", "hacer", "por", "con", "del", "mis", "tienes", "puedo", "sobre", "nuestra", "empresa"],
  fr: ["le", "les", "des", "est", "et", "je", "vous", "mon", "ma", "mes", "comment", "quoi", "combien", "une", "pour", "site", "coûte", "avez", "pouvez", "bonjour", "merci", "entreprise", "faire", "avec", "du", "au", "aux", "notre", "nous", "votre", "besoin", "c'est", "qu'est-ce", "pourriez", "suis"],
};

// Which of English, Spanish or French a message is written in, or null when it's too short to tell
export function detectLang(text) {
  const t = text.toLowerCase();
  const words = t.match(/[\p{L}']+/gu) || [];
  const score = { en: 0, es: 0, fr: 0 };
  for (const w of words) for (const l of LANGS) if (STOP[l].includes(w)) score[l] += 1;
  if (/[ñ¿¡]/.test(t)) score.es += 2;
  if (/[çœ«»]|[èêëàâîûù]/.test(t)) score.fr += 2;
  if (/[áíóú]/.test(t)) score.es += 1;
  const ranked = LANGS.slice().sort((a, b) => score[b] - score[a]);
  const [best, second] = ranked;
  if (score[best] === 0 || score[best] === score[second]) return null;
  return best;
}

const norm = (s) => s.toLowerCase().normalize("NFC");

// The knowledge entries most relevant to a message (simple keyword overlap, best first)
export function retrieve(text, n = 3) {
  const t = norm(text);
  return ENTRIES
    .map((e) => ({ e, s: e.keywords.reduce((acc, k) => acc + (t.includes(k) ? (k.includes(" ") ? 2 : 1) : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.e);
}

/* ---------- Topics: what each question is about (shown as counts in the dashboard) ---------- */
const TOPICS = {
  pricing: /\b(price|prices|pricing|cost|costs|how much|budget|quote|rates?|fees?|precio|precios|cuesta|cu[aá]nto|presupuesto|tarifas?|coste|prix|co[uû]te?|combien|devis|tarifs?)\b/,
  services: /\b(services?|offer|what do you do|servicios?|ofreces|prestations?|proposez)\b/,
  redesign: /\b(redesign|redo|old|outdated|modernis|moderniz|existing|redise[ñn]|antigu|anticuad|renovar|refonte|vieux|vieill|ancien)/,
  examples: /\b(examples?|portfolio|previous work|your work|projects?|clients?|ejemplos?|trabajos|proyectos?|exemples?|r[ée]alisations?|projets?)\b/,
  timeline: /\b(how long|timeline|deadline|weeks?|months?|cu[aá]nto tiempo|plazos?|semanas?|meses|combien de temps|d[ée]lais?|semaines?|mois)\b/,
  start: /\b(get started|start|begin|next step|hire|empezar|comenzar|contratar|commencer|d[ée]marrer)\b/,
  mobile: /\b(mobile|phones?|responsive|tablets?|m[oó]vil|tel[eé]fono|portable|t[ée]l[ée]phone|smartphone)\b/,
  performance: /\b(slow|fast|speed|performance|loads?|loading|lento|r[aá]pid|velocidad|rendimiento|carga|lent|rapide|vitesse|chargement)/,
  animations: /\b(animations?|animaci[oó]n|animaciones|interactive|interactiv|effects?|efectos?|effets?)\b/,
  support: /\b(support|maintenance|after launch|updates?|soporte|mantenimiento|actualizaci|suivi|mises? à jour)\b/,
  about: /\b(who are you|who is|about (you|marcos)|experience|background|studies|qui[eé]n|experiencia|estudios|qui est|exp[ée]rience|parcours)\b/,
  contact: /\b(contact|e-?mail|phone number|call|whatsapp|contacto|correo|llamar|contactar|joindre|appeler|courriel)\b/,
  seo: /\b(seo|google|search engines?|ranking|buscadores?|posicionamiento|r[ée]f[ée]rencement)\b/,
};
export function topicsOf(text) {
  const t = norm(text);
  return Object.entries(TOPICS).filter(([, re]) => re.test(t)).map(([k]) => k);
}

/* ---------- Enquiry indicators: only what the visitor actually said ----------
   Each indicator is a simple, explainable match on the visitor's own words. */
const SERVICES = {
  design: /\b(new website|custom|design|dise[ñn]o|web nueva|nueva web|conception|nouveau site|sur mesure)\b/,
  redesign: TOPICS.redesign,
  animations: TOPICS.animations,
  mobile: TOPICS.mobile,
  performance: TOPICS.performance,
  support: TOPICS.support,
};
const BUSINESS = {
  restaurant: /\b(restaurants?|restaurante|caf[eé]s?|cafeter[ií]a|bar|bistro|brasserie|pizzer[ií]a|bakery|panader[ií]a|boulangerie)\b/,
  hospitality: /\b(hotels?|h[oô]tel|hostal|hostel|guest ?house|b&b|bed and breakfast|casa rural|apartamentos? tur[ií]sticos?|g[iî]te|chambres? d'h[oô]tes)\b/,
  "professional services": /\b(lawyers?|law firm|abogad[oa]s?|avocats?|consult(ant|ancy|or|ora|ing)|accountants?|asesor[ií]a|gestor[ií]a|comptable|dentists?|dentista|dentiste|clinic|cl[ií]nica|clinique|architects?|arquitect[oa]|architecte|therapist|psic[oó]log|psycholog)\w*/,
  "shop / retail": /\b(shops?|stores?|tienda|boutique|e-?commerce|online shop|tienda online|magasin|retail)\b/,
  "beauty / wellness": /\b(salon|hair|peluquer[ií]a|spa|gym|gimnasio|yoga|fitness|coiffeur|esth[eé]tique|est[eé]tica|barber[ií]a?)\b/,
  "real estate": /\b(real estate|estate agent|inmobiliaria|immobili[eè]re?)\b/,
  "events": /\b(weddings?|events?|bodas?|eventos?|mariages?|[ée]v[ée]nements?)\b/,
};
const HAS_SITE_NO = /\b(don'?t have a (web)?site|no (web)?site|without a website|no tengo (p[aá]gina )?web|no tenemos web|sin web|pas de site|n'ai pas de site|pas encore de site)\b/;
const HAS_SITE_YES = /\b(my (current |old |existing )?(web)?site|our (current |old |existing )?(web)?site|mi (p[aá]gina )?web|nuestra (p[aá]gina )?web|mi p[aá]gina|mon site|notre site)\b/;
const WANTS_CONTACT = /\b(quote|consultation|call me|a call|meeting|get in touch|contact (you|marcos)|hire|work with (you|marcos)|start a project|presupuesto|consulta|llamada|reuni[oó]n|contactar|contratar|trabajar contigo|devis|rendez-vous|un appel|contacter|engager|travailler avec)\b/;
const TIMELINE = /\b((in|within|by|next|this|before) (the )?(\d+ |a |two |few )?(days?|weeks?|months?|summer|year|spring|autumn|winter|january|february|march|april|may|june|july|august|september|october|november|december)|asap|as soon as possible|urgent(ly)?|(en|dentro de|antes de|para) (el |la |un |una |\d+ |dos |pocas? )?(d[ií]as?|semanas?|mes(es)?|verano|a[ñn]o|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)|lo antes posible|urgente|(dans|d'ici|avant) (le |la |un |une |\d+ |deux |quelques )?(jours?|semaines?|mois|été|an(n[ée]e)?)|d[eè]s que possible|urgent)\b/;

export function leadSignals(text) {
  const t = norm(text);
  const out = {
    services: Object.entries(SERVICES).filter(([, re]) => re.test(t)).map(([k]) => k),
    business: (Object.entries(BUSINESS).find(([, re]) => re.test(t)) || [null])[0],
    hasWebsite: HAS_SITE_NO.test(t) ? "no" : HAS_SITE_YES.test(t) ? "yes" : null,
    askedPricing: TOPICS.pricing.test(t),
    wantsContact: WANTS_CONTACT.test(t),
    timeline: (t.match(TIMELINE) || [null])[0],
  };
  return out;
}

/* ---------- Output filter ----------
   The model may only mention the real email address and the site's own links. Any other
   URL, email address or phone number it produces is removed, as are leftover markup tags. */
const ALLOWED_HOSTS = ["marcosgalarraga122-debug.github.io"];
export function sanitizeReply(text) {
  let t = String(text || "").replace(/\r/g, "").trim();
  t = t.replace(/<think>[\s\S]*?(<\/think>|$)/gi, "");                          // reasoning models' scratchpad
  t = t.replace(/<[^>]{1,200}>/g, "");                                       // no HTML
  t = t.replace(/\[([^\]]{1,200})\]\((https?:[^)\s]+)\)/g, (m, label, url) => (isAllowedUrl(url) ? m : label));
  t = t.replace(/\bhttps?:\/\/[^\s)]+/g, (url) => (isAllowedUrl(url) ? url : ""));
  t = t.replace(/\b(?:www\.)[^\s)]+/g, "");
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]*\w/g, () => CONTACT.email);           // only the real address
  t = t.replace(/(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/g, (m) => {
    const d = m.replace(/\D/g, "");                                            // no phone numbers but the real one
    return d.length >= 9 && d !== (CONTACT.phone || "").replace(/\D/g, "") ? "" : m;
  });
  t = t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t.slice(0, 2400);
}
function isAllowedUrl(url) {
  try { return ALLOWED_HOSTS.includes(new URL(url).hostname); } catch { return false; }
}

// An enquiry draft the model wrote between [[ENQUIRY]] markers, kept apart from the reply
export function splitDraft(text) {
  const m = text.match(/\[\[ENQUIRY\]\]([\s\S]*?)(\[\[\/ENQUIRY\]\]|$)/i);
  if (!m) return { reply: text.replace(/\[\[\/?ENQUIRY\]\]/gi, "").trim(), draft: null };
  const draft = m[1].trim().slice(0, 1500);
  const reply = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\[\[\/?ENQUIRY\]\]/gi, "").trim();
  return { reply, draft: draft || null };
}
