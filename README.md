# Marcos — Interactive Portfolio / CV

A one-page interactive CV that shows my skills and work. It's built to stand out:

- WebGL shader background in the hero that follows the mouse
- Preloader, split-letter animations and a text-scramble role switcher
- Smooth scrolling (Lenis) and scroll-driven animations (GSAP ScrollTrigger)
- Physics "skills playground" where visitors can grab and throw the bubbles
- Custom cursor, magnetic buttons, a velocity-reactive marquee and film grain

## View it

Open `index.html` in a browser. No build step is needed.

## Edit the content

Everything to change is marked with `EDIT` comments in `index.html`:

- **About / stats:** the intro text and the numbers
- **Skills:** the bubbles and skill lists
- **Experience:** replace the `[brackets]`
- **Contact:** the social links
- **Hero roles:** the `roles` list in `main.js`
- **Colours:** the variables at the top of `styles.css`

## Publish

Push to GitHub, then enable **Settings → Pages → Deploy from branch → main**.
