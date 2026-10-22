# Neka experiment: provider setup

Status checked 2026-10-22. This is a multi-user web experiment. It has no subscription billing or public enrollment enabled yet. “Neka” is a working product name; no company identity is assumed.

## Ownership
Owner-provided account/contact email: `tobia@donadon.com`. No separate app domain has been selected. DNS control of `donadon.com` is not yet confirmed; do not treat the email address as proof of domain ownership or configure it as a verified sender.

The application owner creates one developer application per provider and environment. Each customer authorizes their own ordinary wearable account through OAuth. Customers do not create developer accounts or give Neka their wearable password. Tokens and health records are scoped to each Neka user.

Supabase organization: `healthapp` (`yxzyabxyqlqovfzjzfej`).
Staging project: `neka-staging` (`pisvrssqmlspuahyvbrx`), US East.
Private review site: https://neka-health-platform.tobi10donadon.chatgpt.site

Keep production separate when the experiment is ready for public users. Choose production region after the audience is known.

## WHOOP: first wearable to activate
Create a team and application at https://developer-dashboard.whoop.com using the owner's WHOOP login.

Prepared app description:
> Neka helps individuals review their own wearable measurements, log meals, and organize personal health reports. Users authorize access to their own recovery and sleep data. Neka displays the source of each measurement and does not infer clinical measurements from photographs or food descriptions.

- Working name: Neka Staging
- Homepage: https://neka-health-platform.tobi10donadon.chatgpt.site
- Callback: https://pisvrssqmlspuahyvbrx.supabase.co/functions/v1/health-api
- Scopes used by current code: `read:recovery read:sleep offline`
- Contact email: `tobia@donadon.com`. A publicly accessible privacy-policy URL is still required before applying for expanded access.
- Store Client ID/Secret in server secrets, never in frontend environment variables or chat.
- Test with a real consenting WHOOP member.

New WHOOP apps start with a 10-member Sandbox tier. Expanded access requires WHOOP review; it is not granted by creating the app. [Official setup](https://developer.whoop.com/docs/developing/getting-started/) · [Member tiers and review](https://developer.whoop.com/docs/developing/app-approval/).

## Fitbit / Google Health
Create a dedicated staging Google Cloud project, enable the Google Health API, and create a Web Server OAuth client. Configure External/Testing audience and explicitly allow test users. Before public launch, complete the verification required by Google. The adapter and final callback are not implemented yet; do not enter an invented callback.

[Google Cloud setup](https://developers.google.com/health/setup) · [Launch checklist](https://developers.google.com/health/developer-checklist).

## Apple Watch
HealthKit access requires a native Apple-platform app with explicit user permission. The current website has no HealthKit bridge. Apple Developer enrollment and the iPhone companion can follow the initial web experiment; do not advertise Apple Watch as connected before that works.

[HealthKit authorization](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data) · [Apple enrollment](https://developer.apple.com/programs/enroll/).

## Nutrition services
- USDA FoodData Central account/API key for food lookup: https://fdc.nal.usda.gov/api-guide/
- A separately billed AI API project for optional label extraction, transcription and food-query extraction. It belongs to the application owner; users do not supply their own AI keys.
- Put keys in Supabase server secrets, configure a small owner-approved usage budget, and retain manual nutrition entry as a fallback. No AI billing has been activated.

## Account email
Supabase's default email delivery is restricted to organization members and is not a public signup email service. Before opening enrollment, configure an SMTP provider and verified sending domain, with email confirmation retained. No email provider, domain purchase or paid plan has been ordered.

[Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

## Still needed from the owner
An email-sending domain with DNS access, the initial target audience/region, and acceptance of provider terms when registering. Use `tobia@donadon.com` for account/contact email. Do not invent a legal entity or accept agreements on the owner's behalf.
