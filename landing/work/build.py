# Builds landing/index.html from one source, so the visible FAQ and the FAQPage JSON-LD can never drift apart.
import json, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

FAQ = [
    ("How is Xeyo different from the WHOOP or Apple Watch app?",
     "Those apps show what the device measures. Xeyo puts that next to your meals, mood, body measurements and blood work, explains each number against your own last 30 days in plain words, and lets you ask an AI about all of it in one place."),
    ("Does Xeyo work with Apple Watch, or do I need a WHOOP?",
     "Both work. WHOOP connects directly and syncs. Apple Watch data comes in from your Apple Health export with your whole history, and you can import again any time. Fitbit and Google Health exports work too."),
    ("How does nutrition tracking work?",
     "Describe a meal in a sentence, say it in a voice note or take a photo. Xeyo estimates the calories, protein, carbs and fat, and you can correct any value. Your day is shown against the calories your wearable says you burned."),
    ("What do I get for €5 a month?",
     "Everything: every wearable connection, nutrition logging, blood work, mood and body records, the daily read and Ask Xeyo, the built-in AI. There is one plan, and you can cancel any time."),
    ("Is my health data private?",
     "Your records belong to your account, and database rules stop any other account from reading them. Wearable connections are stored encrypted, and you can disconnect them at any time."),
    ("Is Xeyo a medical device?",
     "No. Xeyo organises and explains your own data. It does not diagnose or treat anything. Talk to a doctor about symptoms, or about results outside the lab's range."),
]

LD = {
  "@context": "https://schema.org",
  "@graph": [
    {"@type": "Organization", "@id": "https://xeyo.ai/#org", "name": "Xeyo", "url": "https://xeyo.ai/",
     "logo": "https://xeyo.ai/icon-512.png", "email": "tobia@donadon.com"},
    {"@type": "WebSite", "@id": "https://xeyo.ai/#site", "url": "https://xeyo.ai/", "name": "Xeyo",
     "publisher": {"@id": "https://xeyo.ai/#org"}, "inLanguage": "en"},
    {"@type": "WebApplication", "@id": "https://xeyo.ai/#app", "name": "Xeyo", "url": "https://xeyo.ai/",
     "applicationCategory": "HealthApplication",
     "operatingSystem": "Web browser on iPhone, Android, Mac and Windows",
     "description": "A health dashboard that puts your wearable data, nutrition, blood work, mood and body measurements in one place and makes them easy to read. It works with WHOOP, Apple Watch and Fitbit, compares each signal with your own last 30 days, logs meals with AI from text, voice or a photo, and includes an AI assistant that answers from your own data.",
     "image": "https://xeyo.ai/img/s-sleep.webp", "screenshot": "https://xeyo.ai/img/s-sleep.webp",
     "featureList": [
       "WHOOP sync; Apple Health, Fitbit and Google Health imports with full history",
       "Every signal compared with your own 30-day normal, in plain words",
       "AI meal logging from a sentence, a voice note or a photo, with calories and macros",
       "Blood test results against the lab's reference range, with history",
       "Mood check-ins that adjust the daily read",
       "Weight, body fat and lean mass history",
       "Ask Xeyo: an AI assistant that answers from your own readings"],
     "offers": {"@type": "Offer", "price": "5.00", "priceCurrency": "EUR",
       "availability": "https://schema.org/InStock", "url": "https://xeyo.ai/#price",
       "priceSpecification": {"@type": "UnitPriceSpecification", "price": "5.00", "priceCurrency": "EUR",
         "billingDuration": "P1M", "unitText": "month"}},
     "publisher": {"@id": "https://xeyo.ai/#org"}},
    {"@type": "FAQPage", "@id": "https://xeyo.ai/#faq",
     "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ]},
  ],
}

faq_html = "\n".join(
    f'        <details class="qa"{" open" if i == 0 else ""}>\n'
    f'          <summary><h3>{html.escape(q)}</h3><span class="qa-icon" aria-hidden="true"></span></summary>\n'
    f'          <p>{html.escape(a)}</p>\n'
    f'        </details>'
    for i, (q, a) in enumerate(FAQ))

src = (ROOT / "work" / "index.template.html").read_text()
out = src.replace("{{LD}}", json.dumps(LD, indent=1, ensure_ascii=False)).replace("{{FAQ}}", faq_html)
(ROOT / "index.html").write_text(out)
print("index.html", len(out), "bytes")
