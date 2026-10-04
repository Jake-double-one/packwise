# Roadmap

What's done and what's planned for Packwise. Ideas and feedback are welcome as GitHub issues.

## ✅ Done

- Template with up to three levels, drag & drop, live sync
- Tri-state context chips (only with / never with), quantity rules, per-person items, personal base sets
- Trip generation with live preview and reasons
- Weather from Open-Meteo (forecast or 10-year climate) with plausibility warnings
- Plug adapters, voltage check, currency and road-trip hints (vignettes, Crit'Air, …)
- Live collaboration (presence, activity log) and template sync (↑ Template, remove from template)
- Login modes `none` / `local` / `accounts`, households and roles, invitations, SMTP
- Import with review step (text, Markdown, OneNote / Word, JSON) and JSON export
- Light / dark / AMOLED themes, English and German, extra languages via `/data/locales`
- To-dos before departure (optional per trip, due dates, chips, own template)
- Return-trip mode (second checkmark "packed again", consumables excluded)
- Offline mode (PWA cache plus a sync queue for changes made offline)
- Personal bags per person (colour, own suitcase/carry-on), sortable people and bags
- Two-column trip view with drag & drop between categories, bags and travellers
- Trip info tab: OpenStreetMap map, day-by-day weather (forecast or 10-year average), country facts
- Trip notes (address, phone, link, code, text, secret fields) shared live and offline; editing destination and dates

## 🔜 Next

- **"Not needed" after the trip**: mark items you didn't use. Repeated marks suggest removing the item from the template or adding a rule.
- **Guest links**: share a trip without a login. Choose check-only or edit, set an expiry, revoke at any time.

## 💡 Later

- **Reminders** by e-mail, Web Push and ntfy / Gotify: "3 days to go – 60 % packed, 2 to-dos open"
- **Weather updates**: re-check when the trip comes into forecast range and suggest changes
- **Calendar export** (`.ics`) for trips and to-dos
- **Optional 2FA (TOTP)** per user and **OIDC login** (e.g. Authentik)
- **Template gallery and community templates** (`COMMUNITY_CATALOG_URL`)
- **REST API with tokens, webhooks** and a share target (e.g. to connect a shopping-list app)
