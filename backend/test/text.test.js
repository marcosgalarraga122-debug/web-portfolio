import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLang, retrieve, topicsOf, leadSignals, sanitizeReply, splitDraft } from "../src/text.js";
import { fallbackReply, systemPrompt } from "../src/chat.js";
import { CONTACT } from "../src/knowledge.js";

test("detects English, Spanish and French", () => {
  assert.equal(detectLang("How much does a website cost?"), "en");
  assert.equal(detectLang("¿Cuánto cuesta una página web para mi restaurante?"), "es");
  assert.equal(detectLang("Combien coûte un site pour mon entreprise ?"), "fr");
  assert.equal(detectLang("Puedes rediseñar mi web?"), "es");
  assert.equal(detectLang("ok"), null);
});

test("retrieves the relevant knowledge", () => {
  assert.equal(retrieve("How much does a website cost?")[0].id, "pricing");
  assert.equal(retrieve("¿Puedes rediseñar mi web antigua?")[0].id, "redesign");
  assert.equal(retrieve("Pouvez-vous me montrer des exemples de projets ?")[0].id, "examples");
  assert.deepEqual(retrieve("xyzzy"), []);
});

test("tags topics in all three languages", () => {
  assert.ok(topicsOf("How much does it cost?").includes("pricing"));
  assert.ok(topicsOf("¿Cuánto cuesta?").includes("pricing"));
  assert.ok(topicsOf("Quel est le prix d'un site ?").includes("pricing"));
  assert.ok(topicsOf("My website is slow on mobile").includes("performance"));
  assert.ok(topicsOf("My website is slow on mobile").includes("mobile"));
});

test("extracts only what the visitor said", () => {
  const s = leadSignals("I run a small restaurant and my website looks old, I'd like a quote within 2 weeks");
  assert.equal(s.business, "restaurant");
  assert.equal(s.hasWebsite, "yes");
  assert.ok(s.services.includes("redesign"));
  assert.equal(s.wantsContact, true);
  assert.match(s.timeline, /2 weeks/);
  const n = leadSignals("No tengo web y tengo una peluquería");
  assert.equal(n.hasWebsite, "no");
  assert.equal(n.business, "beauty / wellness");
  const empty = leadSignals("hello");
  assert.equal(empty.business, null);
  assert.equal(empty.wantsContact, false);
});

test("removes invented contact details, links and markup", () => {
  const out = sanitizeReply("Call +34 611 222 333, WhatsApp 611222333 or write to marcos@gmail.com. See https://evil.example.com and [book](https://calendly.com/x). <script>alert(1)</script><think>secret</think>Done");
  assert.doesNotMatch(out, /611/);
  assert.doesNotMatch(out, /gmail|evil|calendly|<script|secret/);
  assert.match(out, new RegExp(CONTACT.email.replace(".", "\\.")));
  assert.match(sanitizeReply("Visit https://marcosgalarraga122-debug.github.io/web-portfolio/#contact"), /github\.io/);
  assert.match(sanitizeReply("Between 2025 and 2026, 24 hours"), /2025 and 2026, 24 hours/);
});

test("splits an enquiry draft from the reply", () => {
  const { reply, draft } = splitDraft("Here it is:\n[[ENQUIRY]]\nHi Marcos, I run a café.\n[[/ENQUIRY]]\nYou can send it yourself.");
  assert.equal(draft, "Hi Marcos, I run a café.");
  assert.match(reply, /Here it is/);
  assert.doesNotMatch(reply, /ENQUIRY/);
});

test("fallback answers come from the knowledge base in the right language", () => {
  assert.match(fallbackReply("¿Cuánto cuesta?", "es"), /presupuesto/);
  assert.match(fallbackReply("hola", "es"), /asistente de IA/);
  assert.match(fallbackReply("qwerty", "fr"), /pas sûr/);
  assert.match(fallbackReply("how much?", "en"), new RegExp(CONTACT.email.replace(".", "\\.")));
});

test("system prompt names the reply language and the real contact", () => {
  const p = systemPrompt("fr", retrieve("prix"));
  assert.match(p, /Always reply in French/);
  assert.match(p, new RegExp(CONTACT.email.replace(".", "\\.")));
  assert.match(p, /no fixed prices/i);
});
