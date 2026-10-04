# Changelog

All notable changes to Packwise. Docker images: `ghcr.io/jake-double-one/packwise:<version>`.

## v0.2.0 – Initial release

The first public release of Packwise: self-hosted, collaborative packing lists in a single container.

### Highlights

- **One template, smart trips** – a template with up to three levels (category › subcategory › item group). Each trip is generated from it based on destination, dates, weather, how you travel and who comes along.
- **Smart chips per item** – *only with* / *never with* for getting there, accommodation, activities, climate, season, region and fellow travellers; quantity rules per day or night, per traveller, with laundry cap.
- **Travellers and bags** – people, kids and pets without accounts; every adult and child gets a suitcase and a carry-on in their own colour (babies a suitcase only). Lists can be viewed by category, bag or traveller, with drag & drop between them.
- **Live collaboration** – everyone opens the same link and checks items off in real time, with presence and an activity log. New or removed items can go back into the template with one tap.
- **Weather** from Open-Meteo – the real forecast up to 16 days ahead, otherwise the 10-year average for each calendar day, with plausibility warnings.
- **Trip info tab** – OpenStreetMap map, day-by-day weather, sockets and voltage with adapter hints, currency and driving side.
- **By car** – speed limits (towns, country roads, expressways, motorways), alcohol limits, child seat rules and local specialities for 27 countries, plus road-trip hints such as vignettes and Crit'Air.
- **Trip notes** – accommodation address with map and navigation links, rental car (booking number, pick-up and drop-off), phone numbers, booking codes, links and 🔒 secret fields like the Wi-Fi password.
- **To-dos before departure**, **return-trip mode** and **offline mode** (installable PWA with a sync queue).
- **Import with review step** – plain text, Markdown, OneNote / Word pastes and Packwise JSON; JSON backup export.
- **Three login modes** – `none`, `local` (one shared password, default) and `accounts` (e-mail and password, private households, roles, invitations, SMTP).
- **Admin area** for accounts mode – manage accounts, e-mail addresses, passwords and password links, household memberships and roles, merge accounts.
- **Themes** – light, dark, AMOLED and system. **Languages** – English and German, more via `/data/locales`.
- **Tiny footprint** – one container, SQLite, images for amd64 and arm64. The running version is shown under Settings and in `/api/health`.

### Bug fixes

- Selecting a destination from the place suggestions now works with a normal click or tap. Before, the list closed before the click landed, so trips were saved with the country only. Existing trips can be fixed under *Trip info → Edit trip*.
- Switching an existing `none` / `local` install to `accounts` no longer locks everybody out: you claim your profile on the next visit, and all other profiles keep their access.
- Login and invite links work on plain HTTP in the LAN (cookies are only marked secure behind HTTPS or with `ORIGIN=https://…`).
- Trip lists no longer show a false "differs from template" hint for items in personal bags.
- Save errors are shown as a message instead of failing silently; template changes are applied immediately and rolled back if saving fails.
- Editing only the country of a trip now also updates the destination name.
- The "By car" card is aligned with the card next to it.
- Release tags like `v0.1` are now also published as image tags (`:0.1`).

### Known limitations

- Brave Shields can block some requests. Turn Shields off for your Packwise address.
- Flag emojis are shown as letters (e.g. "IT") on Windows.
