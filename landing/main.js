// Xeyo landing: the checkout link, and the glass refraction pass where the browser supports it.
const CHECKOUT_URL = 'https://buy.stripe.com/4gMeVcevV71hce2g0j0RG04'; // Paste the payment link here; every "Get Xeyo" button uses it.

if (CHECKOUT_URL) for (const a of document.querySelectorAll('[data-buy]')) { a.href = CHECKOUT_URL; a.rel = 'noopener'; }

// Chromium can run an SVG filter inside backdrop-filter, which gives the glass its lens. Others keep the frost.
if (navigator.userAgentData?.brands?.some(b => /Chromium/.test(b.brand))) document.documentElement.classList.add('refract');
