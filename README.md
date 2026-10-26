# Marcos — Interactive Portfolio / CV

A one-page interactive CV that shows my skills and work. It's built to stand out:

- WebGL shader background in the hero with ripples and air movement that follow the mouse
- Scroll "portal": the camera travels into the "o" of Marcos and through it into the particle portrait
- First-visit intro (`intro.js`): a ray-traced drop of water falls in slow motion, the camera cranes overhead, and the waves from its impact (solved as real water: gravity, surface tension and viscosity) reveal the real page beneath, in focus behind the crests and refracted by the same waves. It plays once per browser; add `?intro` to the address to see it again. Any key, click or scroll skips it
- Split-letter animations and a text-scramble role switcher
- Smooth scrolling (Lenis) and scroll-driven animations (GSAP ScrollTrigger)
- Process timeline that fills and lights up step by step as you scroll
- Interactive particle portrait: ~200k particles rebuilt from the pixels of a 450 × 450 photo (`images/portrait-particles.jpg`), assembled and exploded by scroll across the whole screen, parted by the cursor, click for a shockwave
- English / Spanish / French switcher (all text in `i18n.js`)
- Stat numbers that roll in like an odometer
- Enquiry form that opens the visitor's email app with their message filled in
- Magnetic buttons, a velocity-reactive marquee and film grain

## View it

Open `index.html` in a browser. No build step is needed.

## Edit the content

All text (in all three languages) lives in `i18n.js`. Other things to change are marked with `EDIT` comments in `index.html`:

- **About / stats:** the intro text, the numbers and the photos in `images/`
- **Services:** the four service cards
- **Process:** the four steps
- **Experience:** fill in the commented-out rows
- **Why me / FAQ:** check the promises and answers match how you work
- **Contact:** add your phone number and social profiles (commented out in the Contact section)
- **Work:** add real client projects as further case studies next to "this website"
- **Hero roles:** the `roles` list in `main.js`
- **Colours:** the variables at the top of `styles.css`

## Publish

Push to GitHub, then enable **Settings → Pages → Deploy from branch → main**.
