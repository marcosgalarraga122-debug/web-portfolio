/* Marcos's AI Assistant: the chat window. Loaded by main.js (initAssistant) the first time a
   visitor uses the floating button, so it costs nothing until then. The replies come from the
   backend in /backend (a Cloudflare Worker); nothing here runs a model in the browser.
   Conversation state is kept in sessionStorage (this tab only) so closing and reopening the
   chat, or reloading the page, doesn't lose it. */
(() => {
  const STR = {
    en: {
      title: "Marcos's AI Assistant",
      sub: "AI assistant · replies in seconds",
      subOffline: "You're offline",
      close: "Close the chat",
      restart: "Start a new conversation",
      welcome: "Hi! I'm Marcos's AI assistant. I can tell you about his services, how he works, and how a new or redesigned website could help your business. What would you like to know?",
      suggestions: ["How can you help improve my website?", "What services do you offer?", "Can you redesign my existing website?", "How much does a website cost?", "Can I see examples of your work?", "How do I get started?"],
      label: "Your message",
      placeholder: "Ask me anything…",
      send: "Send",
      typing: "Marcos's AI Assistant is typing",
      foot: "You're chatting with an AI, which can make mistakes. Conversations are stored for up to 90 days so Marcos can read them and improve his replies. Please don't share sensitive information.",
      privacy: "Privacy",
      fromSite: "Quick answer from Marcos's site information",
      email: "Email Marcos",
      form: "Use the contact form",
      copy: "Copy email address",
      copied: "Copied ✓",
      draftLabel: "Your enquiry draft",
      draftOpen: "Open in my email app",
      draftCopy: "Copy text",
      draftNote: "Nothing is sent until you press send in your own email app.",
      subject: "Website enquiry",
      errOffline: "You seem to be offline. Check your connection and try again.",
      errBusy: "You're sending messages quickly. Please wait a moment and try again.",
      errFull: "This conversation has reached its length limit. Start a new one, or email Marcos directly.",
      errServer: "Sorry, something went wrong on my side.",
      errEmail: "You can always email Marcos at",
      retry: "Try again",
      tooLong: "That message is a bit long; please keep it under 800 characters.",
    },
    es: {
      title: "Asistente de IA de Marcos",
      sub: "Asistente de IA · respuesta rápida",
      subOffline: "Sin conexión",
      close: "Cerrar el chat",
      restart: "Empezar una conversación nueva",
      welcome: "¡Hola! Soy el asistente de IA de Marcos. Puedo contarte sus servicios, cómo trabaja y cómo una web nueva o rediseñada podría ayudar a tu negocio. ¿Qué te gustaría saber?",
      suggestions: ["¿Cómo puedes ayudarme a mejorar mi web?", "¿Qué servicios ofreces?", "¿Puedes rediseñar mi web actual?", "¿Cuánto cuesta una web?", "¿Puedo ver ejemplos de tu trabajo?", "¿Cómo empezamos?"],
      label: "Tu mensaje",
      placeholder: "Pregúntame lo que quieras…",
      send: "Enviar",
      typing: "El asistente de IA de Marcos está escribiendo",
      foot: "Estás hablando con una IA, que puede equivocarse. Las conversaciones se guardan hasta 90 días para que Marcos pueda leerlas y mejorar las respuestas. Por favor, no compartas información sensible.",
      privacy: "Privacidad",
      fromSite: "Respuesta rápida con la información de la web de Marcos",
      email: "Escribir a Marcos",
      form: "Usar el formulario de contacto",
      copy: "Copiar el email",
      copied: "Copiado ✓",
      draftLabel: "Borrador de tu consulta",
      draftOpen: "Abrir en mi correo",
      draftCopy: "Copiar texto",
      draftNote: "No se envía nada hasta que pulses enviar en tu propia aplicación de correo.",
      subject: "Consulta sobre una web",
      errOffline: "Parece que no tienes conexión. Compruébala y vuelve a intentarlo.",
      errBusy: "Estás enviando mensajes muy rápido. Espera un momento y vuelve a intentarlo.",
      errFull: "Esta conversación ha llegado a su límite. Empieza una nueva o escribe directamente a Marcos.",
      errServer: "Lo siento, algo ha fallado por mi parte.",
      errEmail: "Siempre puedes escribir a Marcos a",
      retry: "Reintentar",
      tooLong: "El mensaje es algo largo; por favor, que no pase de 800 caracteres.",
    },
    fr: {
      title: "L'assistant IA de Marcos",
      sub: "Assistant IA · réponse rapide",
      subOffline: "Hors ligne",
      close: "Fermer le chat",
      restart: "Nouvelle conversation",
      welcome: "Bonjour ! Je suis l'assistant IA de Marcos. Je peux vous présenter ses services, sa façon de travailler et comment un site nouveau ou repensé pourrait aider votre activité. Que souhaitez-vous savoir ?",
      suggestions: ["Comment pouvez-vous améliorer mon site ?", "Quels services proposez-vous ?", "Pouvez-vous refaire mon site actuel ?", "Combien coûte un site web ?", "Puis-je voir des exemples de votre travail ?", "Comment commencer ?"],
      label: "Votre message",
      placeholder: "Posez votre question…",
      send: "Envoyer",
      typing: "L'assistant IA de Marcos écrit",
      foot: "Vous discutez avec une IA, qui peut se tromper. Les conversations sont conservées jusqu'à 90 jours pour que Marcos puisse les lire et améliorer les réponses. Merci de ne pas partager d'informations sensibles.",
      privacy: "Confidentialité",
      fromSite: "Réponse rapide à partir des informations du site de Marcos",
      email: "Écrire à Marcos",
      form: "Utiliser le formulaire de contact",
      copy: "Copier l'adresse e-mail",
      copied: "Copié ✓",
      draftLabel: "Brouillon de votre demande",
      draftOpen: "Ouvrir dans ma messagerie",
      draftCopy: "Copier le texte",
      draftNote: "Rien n'est envoyé tant que vous n'appuyez pas sur Envoyer dans votre messagerie.",
      subject: "Demande de site web",
      errOffline: "Vous semblez hors ligne. Vérifiez votre connexion et réessayez.",
      errBusy: "Vous envoyez des messages très vite. Patientez un instant et réessayez.",
      errFull: "Cette conversation a atteint sa limite. Commencez-en une nouvelle ou écrivez directement à Marcos.",
      errServer: "Désolé, un problème est survenu de mon côté.",
      errEmail: "Vous pouvez toujours écrire à Marcos à",
      retry: "Réessayer",
      tooLong: "Ce message est un peu long ; merci de rester sous 800 caractères.",
    },
  };
  const ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  };
  const KEY = "mas_chat";
  const MAX = 800;

  let cfg, root, log, input, sendBtn, suggest, count, isOpen = false, pending = false, opened = false;
  let chat = load();

  const T = () => STR[cfg.lang()] || STR.en;
  function load() {
    try { const c = JSON.parse(sessionStorage.getItem(KEY)); if (c && Array.isArray(c.messages)) return c; } catch {}
    return { id: null, token: null, messages: [] };
  }
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify({ ...chat, messages: chat.messages.slice(-60) })); } catch {}
  }
  const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mailto = (body) => `mailto:${cfg.email}?subject=${encodeURIComponent(T().subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;

  // The reply is escaped first; only bold, simple lists, line breaks and the real email
  // address (and the site's own links) are turned back into markup
  function format(text) {
    const emailRe = new RegExp(cfg.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const inline = (s) => escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(emailRe, `<a href="mailto:${cfg.email}" data-contact="chat_email">${cfg.email}</a>`)
      .replace(/\bhttps:\/\/marcosgalarraga122-debug\.github\.io\/[^\s<]*/g, (u) => `<a href="${u}">${u}</a>`);
    return text.split(/\n{2,}/).map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("")}</ul>`;
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    }).join("");
  }

  function build() {
    root = h("div", "assist");
    root.id = "assist";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-labelledby", "assist-title");
    root.setAttribute("data-lenis-prevent", "");          // let the chat scroll on its own
    root.innerHTML = `
      <header class="assist-head">
        <span class="assist-avatar" aria-hidden="true">M</span>
        <div class="assist-who"><p class="assist-title" id="assist-title"></p><p class="assist-sub"></p></div>
        <button type="button" class="assist-icon-btn assist-restart">${ICON.restart}</button>
        <button type="button" class="assist-icon-btn assist-close">${ICON.close}</button>
      </header>
      <div class="assist-log" role="log" aria-live="polite"></div>
      <div class="assist-suggest"></div>
      <form class="assist-form">
        <label class="sr-only" for="assist-input"></label>
        <textarea class="assist-input" id="assist-input" rows="1" maxlength="${MAX + 200}" enterkeyhint="send"></textarea>
        <button type="submit" class="assist-send" disabled>${ICON.send}</button>
      </form>
      <p class="assist-count" aria-live="polite"></p>
      <p class="assist-foot"><span class="assist-foot-text"></span> <a href="privacy.html" target="_blank" rel="noopener"></a></p>`;
    document.body.append(root);
    log = root.querySelector(".assist-log");
    input = root.querySelector(".assist-input");
    sendBtn = root.querySelector(".assist-send");
    suggest = root.querySelector(".assist-suggest");
    count = root.querySelector(".assist-count");

    root.querySelector(".assist-close").addEventListener("click", () => close());
    root.querySelector(".assist-restart").addEventListener("click", restart);
    root.querySelector(".assist-form").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
    input.addEventListener("keydown", (e) => {
      // Enter sends, Shift+Enter adds a line (not while an IME is composing text)
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
    });
    input.addEventListener("input", () => { autosize(); updateCount(); });
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    root.addEventListener("click", onContactClick);
    addEventListener("online", () => { root.classList.remove("offline"); texts(); });
    addEventListener("offline", () => { root.classList.add("offline"); texts(); });
    if (!navigator.onLine) root.classList.add("offline");
    document.addEventListener("langchange", () => { texts(); if (!chat.messages.length) renderAll(); });
    // Keep the input above the on-screen keyboard on phones
    if (window.visualViewport) {
      const fit = () => root.style.setProperty("--assist-vh", `${visualViewport.height}px`);
      visualViewport.addEventListener("resize", fit);
      fit();
    }
    texts();
    renderAll();
  }

  function texts() {
    const t = T();
    root.querySelector(".assist-title").textContent = t.title;
    root.querySelector(".assist-sub").textContent = navigator.onLine ? t.sub : t.subOffline;
    root.querySelector(".assist-close").setAttribute("aria-label", t.close);
    root.querySelector(".assist-close").title = t.close;
    root.querySelector(".assist-restart").setAttribute("aria-label", t.restart);
    root.querySelector(".assist-restart").title = t.restart;
    root.querySelector("label[for=assist-input]").textContent = t.label;
    input.placeholder = t.placeholder;
    sendBtn.setAttribute("aria-label", t.send);
    root.querySelector(".assist-foot-text").textContent = t.foot;
    const p = root.querySelector(".assist-foot a");
    p.textContent = t.privacy;
    p.href = `privacy.html#${cfg.lang()}`;
  }

  function autosize() {
    input.style.height = "auto";
    input.style.height = `${Math.min(132, input.scrollHeight)}px`;
    sendBtn.disabled = pending || !input.value.trim();
  }
  function updateCount() {
    const n = input.value.length;
    count.textContent = n > MAX - 100 ? `${n} / ${MAX}` : "";
  }

  function renderAll() {
    log.replaceChildren();
    addBot({ text: T().welcome, local: true });
    chat.messages.forEach((m) => (m.role === "user" ? addMe(m.text) : addBot(m)));
    // A question left without an answer (it failed before a reload) can be sent again
    const last = chat.messages[chat.messages.length - 1];
    if (last && last.role === "user") addError(T().errServer, () => send(last.text, true));
    suggest.hidden = chat.messages.length > 0;
    suggest.replaceChildren(...T().suggestions.map((q) => {
      const b = h("button", "assist-chip", q);
      b.type = "button";
      b.addEventListener("click", () => send(q));
      return b;
    }));
    scroll();
  }

  function addMe(text) { log.append(h("div", "assist-msg me", text)); }
  function addBot(m) {
    const t = T();
    const bubble = h("div", "assist-msg bot");
    bubble.innerHTML = format(m.text);
    if (m.source === "fallback") bubble.append(h("p", "assist-note", t.fromSite));
    log.append(bubble);
    if (m.draft) {
      const d = h("div", "assist-draft");
      d.append(h("p", "assist-draft-label mono", t.draftLabel), h("pre", null, m.draft));
      const chips = h("div", "assist-chips");
      const open = h("a", "assist-chip primary", t.draftOpen);
      open.href = mailto(m.draft);
      open.dataset.contact = "chat_draft";
      const copy = h("button", "assist-chip", t.draftCopy);
      copy.type = "button";
      copy.addEventListener("click", () => copyText(m.draft, copy, t.draftCopy));
      chips.append(open, copy);
      d.append(chips, h("p", "assist-note", t.draftNote));
      log.append(d);
    }
    if (m.actions && m.actions.length) {
      const chips = h("div", "assist-chips");
      if (m.actions.includes("email")) {
        const a = h("a", "assist-chip primary", t.email);
        a.href = mailto();
        a.dataset.contact = "chat_email";
        chips.append(a);
      }
      if (m.actions.includes("form")) {
        const b = h("button", "assist-chip", t.form);
        b.type = "button";
        b.dataset.contact = "chat_form";
        chips.append(b);
      }
      const c = h("button", "assist-chip", t.copy);
      c.type = "button";
      c.addEventListener("click", () => copyText(cfg.email, c, t.copy));
      chips.append(c);
      log.append(chips);
    }
  }
  function addError(text, retry) {
    const t = T();
    const box = h("div", "assist-msg err");
    box.append(h("p", null, text));
    const p = h("p", null, `${t.errEmail} `);
    const a = h("a", null, cfg.email);
    a.href = mailto();
    a.dataset.contact = "chat_email";
    p.append(a, ".");
    box.append(p);
    if (retry) {
      const chips = h("div", "assist-chips");
      chips.style.marginTop = "10px";
      const b = h("button", "assist-chip", t.retry);
      b.type = "button";
      b.addEventListener("click", () => { box.remove(); retry(); });
      chips.append(b);
      box.append(chips);
    }
    log.append(box);
    scroll();
  }
  const scroll = () => requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });

  async function copyText(text, btn, label) {
    try { await navigator.clipboard.writeText(text); btn.textContent = T().copied; setTimeout(() => (btn.textContent = label), 1600); } catch {}
  }

  // Contact options inside the chat: recorded in the conversation (and in analytics, after consent)
  function onContactClick(e) {
    const el = e.target.closest("[data-contact]");
    if (!el) return;
    const kind = el.dataset.contact;
    if (kind === "chat_form") {
      e.preventDefault();
      close();
      cfg.goToContact();
    }
    cfg.track("contact_click", kind);
    if (chat.id) {
      fetch(`${cfg.api}/api/chat/contact`, {
        method: "POST", keepalive: true, headers: { "content-type": "text/plain" },
        body: JSON.stringify({ conversationId: chat.id, token: chat.token }),
      }).catch(() => {});
    }
  }

  async function send(raw, isRetry) {
    const text = String(raw || "").trim();
    if (!text || pending) return;
    if (text.length > MAX) { addError(T().tooLong); return; }
    if (!isRetry) {
      chat.messages.push({ role: "user", text });
      save();
      addMe(text);
      input.value = "";
      autosize(); updateCount();
      suggest.hidden = true;
      cfg.track("chat_message");
    }
    if (!navigator.onLine) { addError(T().errOffline, () => send(text, true)); return; }
    pending = true;
    sendBtn.disabled = true;
    const typing = h("div", "assist-msg bot assist-typing");
    typing.setAttribute("role", "status");
    typing.setAttribute("aria-label", T().typing);
    typing.innerHTML = "<i></i><i></i><i></i>";
    log.append(typing);
    scroll();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 35000);
    try {
      const res = await fetch(`${cfg.api}/api/chat`, {
        method: "POST", signal: ctrl.signal,
        headers: { "content-type": "text/plain" },        // a "simple" request: no extra preflight round trip
        body: JSON.stringify({
          message: text, lang: cfg.lang(), page: cfg.section(),
          ...(chat.id ? { conversationId: chat.id, token: chat.token } : {}),
          ...(cfg.visitorId() ? { visitorId: cfg.visitorId() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404 && data.error === "conversation_not_found" && chat.id) {
        // The conversation expired on the server: carry on in a new one
        chat.id = chat.token = null;
        save();
        typing.remove(); pending = false;
        return send(text, true);
      }
      if (!res.ok) throw Object.assign(new Error(data.error || "http"), { status: res.status, code: data.error });
      chat.id = data.conversationId;
      if (data.token) chat.token = data.token;
      const m = { role: "bot", text: data.reply, actions: data.actions, draft: data.draft, source: data.source };
      chat.messages.push(m);
      save();
      typing.remove();
      addBot(m);
      scroll();
    } catch (err) {
      typing.remove();
      const t = T();
      if (err.code === "conversation_full") addError(t.errFull);
      else if (err.status === 429) addError(t.errBusy, () => send(text, true));
      else if (!navigator.onLine) addError(t.errOffline, () => send(text, true));
      else addError(t.errServer, () => send(text, true));
    } finally {
      clearTimeout(timer);
      pending = false;
      autosize();
    }
  }

  function restart() {
    chat = { id: null, token: null, messages: [] };
    save();
    renderAll();
    input.focus();
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    root.hidden = false;
    cfg.fab.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("in")));
    if (matchMedia("(max-width: 560px)").matches) { document.documentElement.classList.add("assist-lock"); cfg.pauseScroll(true); }
    if (!opened) { opened = true; cfg.track("chat_open"); }
    // On touch screens, don't pop the keyboard up straight away
    if (matchMedia("(pointer: fine)").matches) input.focus({ preventScroll: true });
    else root.querySelector(".assist-close").focus({ preventScroll: true });
    scroll();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove("in");
    cfg.fab.setAttribute("aria-expanded", "false");
    document.documentElement.classList.remove("assist-lock");
    cfg.pauseScroll(false);
    setTimeout(() => { if (!isOpen) root.hidden = true; }, cfg.reduceMotion ? 0 : 260);
    cfg.fab.focus({ preventScroll: true });
  }

  window.MarcosAssistant = {
    init(config) { cfg = config; build(); },
    toggle() { (isOpen ? close : open)(); },
    open, close,
  };
})();
