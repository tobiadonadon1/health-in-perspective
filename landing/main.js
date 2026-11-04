// Xeyo landing: the checkout link, and the glass refraction pass where the browser supports it.
const CHECKOUT_URL = 'https://buy.stripe.com/4gMeVcevV71hce2g0j0RG04'; // Paste the payment link here; every "Get Xeyo" button uses it.

if (CHECKOUT_URL) for (const a of document.querySelectorAll('[data-buy]')) { a.href = CHECKOUT_URL; a.rel = 'noopener'; }

// Chromium can run an SVG filter inside backdrop-filter, which gives the glass its lens. Others keep the frost.
if (navigator.userAgentData?.brands?.some(b => /Chromium/.test(b.brand))) document.documentElement.classList.add('refract');

// Hero figures: on touch screens there is no hover, so the woman and the man light up in turn; a tap lights one.
{
  const figs = [...document.querySelectorAll('.subject .figure')];
  if (figs.length && matchMedia('(hover: none)').matches) {
    let i = 0, timer;
    const light = n => figs.forEach((f, k) => f.classList.toggle('lit', k === n));
    const cycle = () => { light(i); i = (i + 1) % figs.length; timer = setTimeout(cycle, 4200); };
    figs.forEach((f, k) => f.addEventListener('click', () => { clearTimeout(timer); i = k; cycle(); }));
    setTimeout(cycle, 1600);
  }
}
