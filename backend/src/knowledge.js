/* Marcos's business knowledge: the only facts the assistant may use.
   EDIT this file to change what the assistant knows, then redeploy (npm run deploy).
   Every fact here comes from the portfolio website (index.html / i18n.js) or from Marcos.
   Do not add prices, clients, testimonials or contact methods that aren't real. */

export const CONTACT = {
  email: "Marcos.galarraga122@outlook.com",
  // The contact form at the bottom of the portfolio page (it opens the visitor's email app)
  formUrl: "https://marcosgalarraga122-debug.github.io/web-portfolio/#contact",
  // EDIT: add these only once they exist and are published on the website
  phone: null,      // e.g. "+34 600 000 000"
  whatsapp: null,   // e.g. "https://wa.me/34600000000"
  booking: null,    // e.g. a real booking page URL
};

// Always given to the model: who Marcos is and the rules of the business
export const CORE = `
- Marcos Cañellas is a freelance web designer and developer (self-employed since 2025), based in Madrid, Spain. He designs and builds custom websites for small businesses, professionals and brands, from the first idea to launch. He is currently taking on new projects.
- Services: (1) custom website design, (2) website redesigns, (3) interactive animations and visual effects, (4) mobile optimisation and responsive web design, (5) website performance optimisation. He also builds the websites (clean, modern code; fast, responsive, search-engine-ready) and offers care & support after launch (updates, improvements and fixes).
- Every site is designed from scratch around the client's brand: no templates. Websites are fast, secure and mobile-first, and set up from the start to be found on search engines.
- Clients work directly with Marcos, from the first call to launch and beyond: no middlemen. Every message gets a reply within 24 hours.
- Prices: no fixed prices are published. Every project gets a clear written quote before any work starts, so the client knows exactly what they get and what it costs. The price depends on the project (size, number of pages, features).
- Timelines depend on the size of the project (a one-page site is quicker than a multi-page site or an online shop). A clear timeline comes with the quote, agreed together, with regular updates.
- Contact: email ${CONTACT.email}, or the contact form at the bottom of this page (it opens the visitor's email app with the message ready to send). No phone number, WhatsApp, booking page or social profiles are published.
- Getting started: send Marcos an email with a short description of the business and what you need; he replies within 24 hours to arrange a call.
- Languages: Marcos works with clients in Spanish and English (both native). He is currently studying French.
`.trim();

// Retrieved when relevant (by keyword), and used for answers when the AI is unavailable.
// keywords: lower-case stems in English, Spanish and French.
export const ENTRIES = [
  {
    id: "services",
    keywords: ["service", "offer", "do you do", "what do you", "servicio", "ofreces", "haces", "prestation", "proposez", "faites", "help", "ayuda", "aide"],
    en: "Marcos offers custom website design, website redesigns, interactive animations and visual effects, mobile optimisation and responsive design, and website performance optimisation. He also builds the site itself and offers care & support after launch. Each service is about presenting your business professionally, making the site easy to use on every device and helping it stand out from competitors.",
    es: "Marcos ofrece diseño web a medida, rediseño de webs, animaciones interactivas y efectos visuales, optimización para móvil y diseño responsive, y optimización del rendimiento. También desarrolla la web y ofrece mantenimiento y soporte tras el lanzamiento. Todo está pensado para presentar tu negocio con profesionalidad, que la web sea fácil de usar en cualquier dispositivo y que destaque frente a la competencia.",
    fr: "Marcos propose la conception de sites sur mesure, la refonte de sites, des animations interactives et effets visuels, l'optimisation mobile et le design responsive, ainsi que l'optimisation des performances. Il développe aussi le site et assure la maintenance après la mise en ligne. L'objectif : présenter votre activité avec professionnalisme, offrir un site agréable sur tous les appareils et vous démarquer de la concurrence.",
  },
  {
    id: "design",
    keywords: ["design", "custom", "brand", "template", "look", "diseño", "medida", "marca", "plantilla", "conception", "sur mesure", "marque", "modèle"],
    en: "Custom website design: every site is designed from scratch around your brand, with no templates. The aim is a design that builds trust and guides visitors towards getting in touch or buying. You review the design and give feedback before any code is written.",
    es: "Diseño web a medida: cada web se diseña desde cero en torno a tu marca, sin plantillas. El objetivo es un diseño que genere confianza y guíe a tus visitantes a contactarte o comprar. Tú revisas el diseño y das tu opinión antes de escribir una sola línea de código.",
    fr: "Conception sur mesure : chaque site est conçu de zéro autour de votre marque, sans modèle. L'objectif est un design qui inspire confiance et incite les visiteurs à vous contacter ou à acheter. Vous validez le design avant la moindre ligne de code.",
  },
  {
    id: "redesign",
    keywords: ["redesign", "old", "outdated", "existing", "modernis", "moderniz", "update my", "refresh", "rediseñ", "antigu", "anticuad", "renovar", "actual", "refonte", "vieux", "vieill", "ancien", "existant", "moderniser"],
    en: "Website redesign: Marcos can turn an outdated website into a modern one that loads faster and is easier to use, especially on mobile. He starts by understanding your business and what isn't working today, then redesigns the structure and look before rebuilding it.",
    es: "Rediseño web: Marcos puede convertir una web anticuada en una moderna que carga más rápido y es más fácil de usar, sobre todo en el móvil. Empieza por entender tu negocio y lo que no funciona hoy, y después rediseña la estructura y el aspecto antes de reconstruirla.",
    fr: "Refonte : Marcos peut transformer un site vieillissant en un site moderne, plus rapide et plus simple à utiliser, surtout sur mobile. Il commence par comprendre votre activité et ce qui ne fonctionne pas aujourd'hui, puis repense la structure et le design avant de reconstruire le site.",
  },
  {
    id: "animation",
    keywords: ["animation", "interactive", "effect", "motion", "3d", "scroll", "animación", "interactiv", "efecto", "effet", "interacti"],
    en: "Interactive animations and visual effects: smooth, purposeful motion that makes a site memorable and helps it stand out, while keeping it fast and usable. This portfolio is an example: the water-drop intro, the scroll zoom into the \"o\" of \"Marcos\" and the animated sections were all designed and built by Marcos.",
    es: "Animaciones interactivas y efectos visuales: movimiento fluido y con intención que hace la web memorable y la ayuda a destacar, sin perder rapidez ni facilidad de uso. Este portfolio es un ejemplo: la intro de la gota de agua, el zoom al hacer scroll dentro de la «o» de «Marcos» y las secciones animadas las ha diseñado y programado Marcos.",
    fr: "Animations interactives et effets visuels : un mouvement fluide et utile qui rend le site mémorable et le distingue, tout en restant rapide et simple à utiliser. Ce portfolio en est un exemple : l'intro de la goutte d'eau, le zoom dans le « o » de « Marcos » au défilement et les sections animées ont été conçus et développés par Marcos.",
  },
  {
    id: "mobile",
    keywords: ["mobile", "phone", "responsive", "tablet", "device", "móvil", "movil", "teléfono", "tablet", "dispositivo", "portable", "téléphone", "tablette", "appareil", "smartphone"],
    en: "Mobile optimisation and responsive design: websites are built mobile-first, so they are easy to read and use on phones and tablets, with clear buttons, readable text and contact details that are easy to find.",
    es: "Optimización para móvil y diseño responsive: las webs se construyen pensando primero en el móvil, para que se lean y se usen con facilidad en teléfonos y tablets, con botones claros, textos legibles y datos de contacto fáciles de encontrar.",
    fr: "Optimisation mobile et design responsive : les sites sont pensés d'abord pour le mobile, pour être lisibles et faciles à utiliser sur téléphone et tablette, avec des boutons clairs, des textes lisibles et des coordonnées faciles à trouver.",
  },
  {
    id: "performance",
    keywords: ["slow", "fast", "speed", "performance", "load", "optimi", "lento", "rápid", "velocidad", "rendimiento", "carga", "lent", "rapide", "vitesse", "chargement"],
    en: "Website performance optimisation: making pages load faster and run smoothly, including on older phones and slow connections, by optimising images, code and loading. A faster site is more pleasant to use and less likely to lose visitors while it loads.",
    es: "Optimización del rendimiento: conseguir que las páginas carguen más rápido y funcionen con fluidez, también en móviles antiguos y conexiones lentas, optimizando imágenes, código y carga. Una web rápida es más agradable de usar y pierde menos visitas mientras carga.",
    fr: "Optimisation des performances : des pages qui se chargent plus vite et restent fluides, même sur des téléphones anciens et des connexions lentes, en optimisant les images, le code et le chargement. Un site rapide est plus agréable et perd moins de visiteurs pendant le chargement.",
  },
  {
    id: "pricing",
    keywords: ["price", "cost", "how much", "budget", "quote", "rate", "fee", "cheap", "precio", "cuesta", "cuánto", "cuanto", "presupuesto", "tarifa", "coste", "barato", "prix", "coût", "combien", "devis", "tarif"],
    en: "There are no fixed prices on the site, because every project is different. Marcos gives you a clear written quote before any work starts, so you know exactly what you're getting and what it costs. The quickest way to get one is to email him a short description of your business and what you need; he replies within 24 hours.",
    es: "En la web no hay precios fijos, porque cada proyecto es distinto. Marcos te da un presupuesto claro por escrito antes de empezar, para que sepas exactamente qué recibes y cuánto cuesta. Lo más rápido es enviarle un email con una breve descripción de tu negocio y lo que necesitas; responde en menos de 24 horas.",
    fr: "Il n'y a pas de prix fixes sur le site, car chaque projet est différent. Marcos vous remet un devis écrit clair avant le début du travail, pour savoir exactement ce que vous obtenez et combien cela coûte. Le plus simple : lui envoyer un e-mail avec une courte description de votre activité et de vos besoins ; il répond sous 24 heures.",
  },
  {
    id: "timeline",
    keywords: ["how long", "time", "timeline", "when", "deadline", "weeks", "cuánto tiempo", "tiempo", "plazo", "semanas", "cuándo", "combien de temps", "délai", "semaines", "quand"],
    en: "It depends on the size of the project: a one-page site is quicker than a multi-page site or an online shop. You get a clear timeline together with your quote, agreed with you, and regular updates so you always know where the project stands.",
    es: "Depende del tamaño del proyecto: una web de una sola página es más rápida que una de varias páginas o una tienda online. Recibirás un calendario claro junto con el presupuesto, fijado contigo, y actualizaciones periódicas para que siempre sepas cómo va el proyecto.",
    fr: "Cela dépend de la taille du projet : un site d'une page est plus rapide qu'un site de plusieurs pages ou qu'une boutique en ligne. Vous recevez un planning clair avec votre devis, défini ensemble, et des points réguliers sur l'avancement.",
  },
  {
    id: "process",
    keywords: ["process", "work together", "steps", "how do you work", "proceso", "trabajar", "pasos", "cómo trabajas", "processus", "étapes", "travailler", "comment travaillez"],
    en: "How it works: (1) Discovery call: you talk about your business, customers and goals. (2) Strategy & design: Marcos plans the structure and designs the look; you review it before any code is written. (3) Development: he builds a fast, responsive site, sharing progress along the way. (4) Launch & support: the site goes live, he shows you how to manage it and stays available for updates.",
    es: "Cómo funciona: (1) Llamada inicial: hablamos de tu negocio, tus clientes y tus objetivos. (2) Estrategia y diseño: Marcos planifica la estructura y diseña el aspecto; tú lo revisas antes de escribir código. (3) Desarrollo: construye una web rápida y responsive y te muestra los avances. (4) Lanzamiento y soporte: la web se publica, te enseña a gestionarla y sigue a tu lado para actualizaciones.",
    fr: "Comment ça se passe : (1) Appel de découverte : on parle de votre activité, de vos clients et de vos objectifs. (2) Stratégie & design : Marcos planifie la structure et conçoit le design ; vous validez avant la moindre ligne de code. (3) Développement : il développe un site rapide et responsive en partageant l'avancement. (4) Mise en ligne & suivi : le site est publié, il vous montre comment le gérer et reste disponible pour les mises à jour.",
  },
  {
    id: "start",
    keywords: ["get started", "start", "begin", "next step", "hire", "work with", "empezar", "comenzar", "contratar", "siguiente paso", "commencer", "démarrer", "engager", "prochaine étape"],
    en: "To get started, email Marcos at " + CONTACT.email + " (or use the contact form at the bottom of this page) with a short description of your business and what you need. He replies within 24 hours to arrange a call.",
    es: "Para empezar, escribe a Marcos a " + CONTACT.email + " (o usa el formulario de contacto al final de esta página) con una breve descripción de tu negocio y lo que necesitas. Te responderá en menos de 24 horas para concertar una llamada.",
    fr: "Pour commencer, écrivez à Marcos à " + CONTACT.email + " (ou utilisez le formulaire de contact en bas de cette page) avec une courte description de votre activité et de vos besoins. Il vous répond sous 24 heures pour organiser un appel.",
  },
  {
    id: "contact",
    keywords: ["contact", "email", "mail", "phone", "call", "whatsapp", "reach", "contacto", "correo", "teléfono", "llamar", "contactar", "joindre", "téléphone", "appeler", "courriel", "e-mail"],
    en: "You can reach Marcos by email at " + CONTACT.email + ", or through the contact form at the bottom of this page, which opens your email app with your message ready to send. He replies within 24 hours. There's no phone number or WhatsApp published at the moment.",
    es: "Puedes contactar con Marcos por email en " + CONTACT.email + " o con el formulario de contacto al final de esta página, que abre tu aplicación de correo con el mensaje listo para enviar. Responde en menos de 24 horas. Por ahora no hay teléfono ni WhatsApp publicados.",
    fr: "Vous pouvez joindre Marcos par e-mail à " + CONTACT.email + ", ou via le formulaire de contact en bas de cette page, qui ouvre votre messagerie avec votre message prêt à envoyer. Il répond sous 24 heures. Aucun numéro de téléphone ni WhatsApp n'est publié pour le moment.",
  },
  {
    id: "examples",
    keywords: ["example", "portfolio", "work", "project", "previous", "client", "show", "ejemplo", "trabajos", "proyecto", "clientes", "enseñar", "exemple", "réalisation", "projet", "clients", "travaux"],
    en: "The clearest example is this website: Marcos designed and built it himself, including the water-drop intro, the scroll zoom into the \"o\" of \"Marcos\", the animated sections, three languages and the light and dark themes. Client projects aren't shown on the site yet, so if you'd like to see more, ask Marcos by email.",
    es: "El ejemplo más claro es esta misma web: Marcos la ha diseñado y programado él mismo, con la intro de la gota de agua, el zoom al hacer scroll dentro de la «o» de «Marcos», las secciones animadas, tres idiomas y los temas claro y oscuro. Por ahora la web no muestra proyectos de clientes, así que si quieres ver más, pregúntale a Marcos por email.",
    fr: "Le meilleur exemple est ce site : Marcos l'a conçu et développé lui-même, avec l'intro de la goutte d'eau, le zoom dans le « o » de « Marcos », les sections animées, trois langues et les thèmes clair et sombre. Les projets clients ne sont pas encore présentés sur le site ; pour en voir davantage, demandez à Marcos par e-mail.",
  },
  {
    id: "about",
    keywords: ["who", "about", "experience", "background", "study", "studies", "age", "quién", "experiencia", "estudi", "trayectoria", "edad", "qui", "expérience", "études", "parcours", "âge", "vatel", "hotel"],
    en: "Marcos is 20, Spanish, and based in Madrid. He has worked as a freelance web designer and developer since 2025, designing and building custom websites for small businesses, professionals and brands. Alongside this he is in the second year of a Bachelor's in International Hotel Management at Vatel Madrid, and completed a six-month hotel traineeship (April to October 2026) at Hotel Camiral Golf & Wellness Resort in Girona, a member of The Leading Hotels of the World. Hotel school taught him to think like the guest, and he designs websites the same way: a warm welcome, a clear path and every detail taken care of. He has lived in Spain, the Netherlands, Poland and Romania, and holds the IB Diploma.",
    es: "Marcos tiene 20 años, es español y vive en Madrid. Trabaja como diseñador y desarrollador web freelance desde 2025, creando webs a medida para pequeñas empresas, profesionales y marcas. En paralelo cursa segundo del grado en International Hotel Management en Vatel Madrid, y ha completado unas prácticas de seis meses (de abril a octubre de 2026) en el Hotel Camiral Golf & Wellness Resort de Girona, miembro de The Leading Hotels of the World. La escuela de hostelería le enseñó a pensar como el huésped, y diseña webs igual: una buena bienvenida, un camino claro y cada detalle cuidado. Ha vivido en España, Países Bajos, Polonia y Rumanía, y tiene el Diploma del Bachillerato Internacional (IB).",
    fr: "Marcos a 20 ans, il est espagnol et vit à Madrid. Il est designer et développeur web freelance depuis 2025 et crée des sites sur mesure pour des petites entreprises, des professionnels et des marques. En parallèle, il est en deuxième année du Bachelor International Hotel Management à Vatel Madrid, et a effectué un stage hôtelier de six mois (d'avril à octobre 2026) à l'Hotel Camiral Golf & Wellness Resort, à Gérone, membre de The Leading Hotels of the World. L'école hôtelière lui a appris à penser comme le client, et il conçoit les sites de la même façon : un accueil chaleureux, un parcours clair et chaque détail soigné. Il a vécu en Espagne, aux Pays-Bas, en Pologne et en Roumanie, et il est titulaire du diplôme du Baccalauréat International (IB).",
  },
  {
    id: "needs",
    keywords: ["need from me", "what do you need", "prepare", "logo", "photos", "content", "text", "necesitas", "preparar", "fotos", "contenido", "textos", "besoin", "préparer", "contenu", "textes"],
    en: "From you, Marcos needs your logo, any text and photos you already have, and a few examples of websites you like. He guides you through everything else.",
    es: "Marcos necesita tu logo, los textos y fotos que ya tengas y algunos ejemplos de webs que te gusten. Él te guía con todo lo demás.",
    fr: "Marcos a besoin de votre logo, des textes et photos dont vous disposez déjà, et de quelques exemples de sites que vous aimez. Il vous guide pour tout le reste.",
  },
  {
    id: "edit",
    keywords: ["update it myself", "edit", "manage", "change content", "myself", "cms", "editar", "yo mismo", "gestionar", "modificar", "modifier", "moi-même", "gérer"],
    en: "Yes, you'll be able to update it yourself: if you need to change content regularly, Marcos sets the site up so you can edit it easily and shows you how.",
    es: "Sí, podrás actualizarla tú: si necesitas cambiar contenido con frecuencia, Marcos prepara la web para que puedas editarla fácilmente y te enseña cómo hacerlo.",
    fr: "Oui, vous pourrez le mettre à jour vous-même : si vous devez modifier régulièrement le contenu, Marcos configure le site pour que vous puissiez le faire facilement, et vous montre comment.",
  },
  {
    id: "support",
    keywords: ["support", "maintenance", "after launch", "updates", "fix", "hosting", "mantenimiento", "soporte", "después", "actualizaciones", "maintenance", "après", "mises à jour", "suivi"],
    en: "Yes, there is support after launch: care & support covers updates, improvements and fixes so your website keeps performing.",
    es: "Sí, hay soporte tras el lanzamiento: el servicio de mantenimiento y soporte incluye actualizaciones, mejoras y correcciones para que tu web siga rindiendo.",
    fr: "Oui, il y a un suivi après la mise en ligne : la maintenance comprend les mises à jour, les améliorations et les corrections pour que votre site reste performant.",
  },
  {
    id: "seo",
    keywords: ["seo", "google", "search engine", "rank", "found", "buscador", "posicionamiento", "aparecer", "moteur de recherche", "référencement", "classement"],
    en: "Websites are set up from the start to be found on search engines: fast, mobile-first, with clean code and a clear structure. No one can honestly guarantee a specific ranking, but a solid technical base gives your content the best chance.",
    es: "Las webs se preparan desde el principio para aparecer en los buscadores: rápidas, pensadas para móvil, con código limpio y una estructura clara. Nadie puede garantizar honestamente una posición concreta, pero una buena base técnica le da a tu contenido la mejor oportunidad.",
    fr: "Les sites sont optimisés dès le départ pour les moteurs de recherche : rapides, pensés pour le mobile, avec un code propre et une structure claire. Personne ne peut honnêtement garantir un classement précis, mais une bonne base technique donne à votre contenu les meilleures chances.",
  },
  {
    id: "languages",
    keywords: ["language", "speak", "english", "spanish", "french", "multilingual", "idioma", "hablas", "inglés", "español", "francés", "langue", "parlez", "anglais", "espagnol", "français"],
    en: "Marcos works with clients in Spanish and English (both native) and is currently studying French. Your website can also speak to more than one audience: this portfolio, for example, is in English, Spanish and French.",
    es: "Marcos trabaja con clientes en español e inglés (ambos nativos) y actualmente estudia francés. Tu web también puede hablarle a varios públicos: este portfolio, por ejemplo, está en inglés, español y francés.",
    fr: "Marcos travaille avec ses clients en espagnol et en anglais (deux langues maternelles) et étudie actuellement le français. Votre site peut aussi s'adresser à plusieurs publics : ce portfolio, par exemple, est en anglais, en espagnol et en français.",
  },
];

// How Marcos's services typically apply to different kinds of business. These are ideas to
// discuss, not promises of specific integrations (e.g. booking engines or payments must be
// confirmed with Marcos).
export const INDUSTRY_HINTS = `
- Restaurants, cafés, bars: present the menu clearly (easy to read on a phone), show the food and atmosphere with good photos, make reserving easy (a clear button to however they take bookings today), opening hours, location and contact easy to find, fast on mobile.
- Hotels and hospitality: show rooms and spaces with strong photos, a clear path to the booking method they already use, location and how to get there, information for guests, more than one language. Marcos studies hotel management and has worked in a leading hotel, so he understands the guest's point of view.
- Professional services (lawyers, consultants, accountants, clinics, architects…): explain services clearly, build credibility (who you are, how you work), make it easy to request a consultation, a calm professional design, fast and mobile-friendly.
- Local businesses and shops: location, hours and contact up front, products or services presented clearly, mobile-first, easy to find on search engines.
- Any business with an old site: a modern redesign, faster loading, better mobile use, clearer structure and calls to action.
`.trim();

export const LANGUAGE_NAMES = { en: "English", es: "Spanish", fr: "French" };
