// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Mobile menu
const toggle = document.querySelector(".menu-toggle");
const links = document.querySelector(".nav-links");
toggle.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  toggle.setAttribute("aria-expanded", open);
});
links.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => links.classList.remove("open"))
);

// Portfolio filters
const filters = document.querySelectorAll(".filter");
const projects = document.querySelectorAll(".project");
filters.forEach((btn) =>
  btn.addEventListener("click", () => {
    filters.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const f = btn.dataset.filter;
    projects.forEach((p) =>
      p.classList.toggle("hidden", f !== "all" && p.dataset.category !== f)
    );
  })
);

// Fade sections in as you scroll
const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    }),
  { threshold: 0.15 }
);
document.querySelectorAll(".card, .steps li, h2").forEach((el) => {
  el.classList.add("reveal");
  observer.observe(el);
});

// Contact form — placeholder until connected to a form service (e.g. Formspree)
document.getElementById("contact-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const note = document.createElement("p");
  note.className = "form-note";
  note.textContent = "Thanks! I'll be in touch soon.";
  e.target.replaceWith(note);
});
