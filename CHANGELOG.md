# Changelog

All notable changes to Packwise. Docker images: `ghcr.io/jake-double-one/packwise:<version>`.

## Unreleased

### Added

- **Install as an app**: *Settings → Install as an app* offers Chrome's install prompt as a button, explains the home-screen steps on iPhone/iPad and says why installing is unavailable over `http://`. The manifest is fetched with cookies, so a login proxy in front of Packwise no longer breaks installation; a solid maskable icon for Android's icon shapes; app shortcuts *New trip* and *Trips* in the user's language.
- **Status bar and app title bar follow the theme** (light, dark, AMOLED, system) – before, they were always indigo. Native form controls follow too (`color-scheme`).

### Security

- **Security headers and a Content-Security-Policy** on every page (own scripts and assets only, OpenStreetMap iframe, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policy).
- **Servers entered by users** (ntfy, Gotify, SMTP, push subscriptions) may no longer point at the container itself or at link-local / cloud-metadata addresses; names are resolved and checked on every send. LAN addresses stay allowed.
- **`ORIGIN` warning**: with `accounts` and no `ORIGIN`, the log and the admin area warn that links in e-mails are built from the request's Host header.
- Changing your own password logs out your other devices. Login takes the same time for unknown e-mail addresses as for wrong passwords. API tokens use unbiased random characters. Caps for the rate-limit table and open live connections.

### Changed

- **Trip info**: on the desktop the map grows with the notes next to it, so there is no empty space below it.
- **By car**: speed limits and the alcohol limit are always shown at a glance; child seats and the country's specialities fold out below.
- **By car – cannabis at the wheel**: next to the alcohol limit, the legal THC limit for drivers where there is one (e.g. Germany 3.5 ng/ml and none for novice drivers, Netherlands 3 ng/ml or 1 ng/ml with alcohol, Czechia 2, UK 2, Switzerland 1.5, Norway 1.3, Belgium, Denmark, Ireland and Luxembourg 1; USA depending on the state), otherwise *forbidden*.
- **Compact checklist**: a category with only one traveller (e.g. only the baby or the dog) shows just that traveller's column – no *All* label and no round *All* box; shared items of that category get their box in the same column.

## v0.3.0 – Notifications, sharing and privacy

Reminders by e-mail, ntfy, Gotify and Web Push, SMTP settings in the app, inviting accounts to a single trip, an admin area without access to household contents, AI assistants via MCP, a compact checklist and a lot of polish.

### Added

- **"Adults" as a travellers chip.** For items packed *once per traveller*, the travellers chips now apply per person: a phone charger with *only with adults* goes to the adults only, a toothbrush with *never with baby* skips just the baby. Per-traveller items inside a group such as *Kids* only go to the children and babies. In the item editor this row is then called **"For whom (per person)"**; for shared items the *Adults* chip is hidden, since an adult always travels.

- **Compact checklist (default).** In the category view, the same item of several travellers (e.g. three ID cards) is one row with a box per traveller and an *All* box that is ticked automatically once everybody is done – tapping it ticks or unticks everybody. The card header with the travellers' avatars stays visible while scrolling, also with nested categories. Switch between *Compact* and *Single* in the toolbar at any time (saved per device); checkmarks are kept. Editing a compact row changes the item for all travellers.

- **Emoji per traveller.** Under *Household → Travellers* every person, kid and pet can get an emoji (👩 🧔 👶 🐶 …). It is shown wherever travellers appear: compact checklist, template, trip wizard, bag owners.
- **Profile pictures for accounts** (`AUTH_MODE=accounts` only): pick a symbol or upload a picture (resized to 160 × 160 px in the browser) under *Settings → Profile*. It is shown in the header, the admin area, next to who is online and – instead of the emoji – for the traveller linked to the account. With `none` and `local` a profile is only "who is clicking", so there are no profile pictures (leftovers are removed on start).
- **Activity "Work & Travel"** as a new chip.

- **Undo.** After ticking, unticking or removing something from a trip, a message with *Undo* appears for a few seconds. Removed items (also whole groups) come back with their checkmarks.
- **Packing mode** (🎒 in the toolbar): only open items, bigger boxes, the screen stays on while packing, and a bar shows how much is left. Just ticked items stay visible for a moment.
- **Search** in the packing list: items, notes and categories (also to-dos). Press `/` on a keyboard to jump into it.
- **Duplicate a trip** (Trip info → ⧉ Duplicate): same list incl. your changes, destination, travellers and notes with new dates; checkmarks reset, quantities per day/night, weather and hints recalculated.
- **Archive**: past trips are collected in a collapsed archive on the start page, newest first, grouped by year.

- **AI assistants via MCP** (`MCP_ENABLED=true`): an MCP server at `/mcp` lets Claude, ChatGPT or Grok read packing lists and – with write access – tick items, add items and create trips. Each user can create up to 5 named personal API tokens (read only or read & change) under *Settings*; they are stored encrypted, can be shown again with 👁 and deleted at any time. Changes show up live and are logged as "Name (AI)".

- **Invite accounts to a single trip** (`accounts` mode): *Share → Fellow travellers with an account* creates an invitation link (7 days, single use, optionally by e-mail). Guests can edit the trip completely but see nothing else of the household; new people create an account when opening the link and land right in the trip – no household needed. Shared trips appear under *Shared with me*; guests can leave, household members can remove them. MCP tokens of guests see their shared trips too.

- **E-mail settings in the app**: SMTP server, port, encryption (STARTTLS, SSL/TLS, none), user, password and sender under *Settings* (`none` / `local`) or in the *Administration* (`accounts`), with a test mail before saving. The password is stored encrypted and never shown again. `SMTP_*` environment variables still work and take precedence.
- **Notifications** (*Settings → Notifications*, per person): a reminder X days before departure with packing progress and open to-dos, optionally again the day before, and to-dos that are due – from a chosen hour (`TZ`). Channels: e-mail, **ntfy**, **Gotify** and **Web Push** on the device (needs HTTPS), each with a test button. Only trips you travel on or were invited to, at most one message per trip and day. Channel details are stored encrypted.
- **Security e-mail** (`accounts` mode) when the password of an account changes, by the person or by the admin.

- **Third-party licenses**: `/licenses.txt` (linked under *Settings*) lists every package Packwise ships – browser, server and Docker image – with its full license text, plus the data services (Open-Meteo, OpenStreetMap). Generated at build time, so it can't fall behind.

### Changed

- **No more roles inside a household** (`accounts` mode): everybody in a household may edit everything and invite others; only the creator can delete the household. Former *packers* become members.
- **Leaving a household** (`accounts` mode) is always possible – also your last one. The creator can leave once somebody else stays (the longest member takes over) and can always delete the household, also their only one. Without a household the start page offers *Create household* (with the starter list if you like) and still shows trips shared with you; *Template* and *New trip* lead there instead of showing an error. With `none` / `local` the last household stays protected.

- **Admin area without access to contents** (`accounts` mode): the admin sees households only by name, members and number of trips. Adding accounts (including oneself) to households, creating accounts inside an existing household, renaming households and merging active accounts are gone; only profiles without their own login can be merged. Households with members can only be deleted by their creator – the admin cleans up **orphaned households** in a new section. Deleting an account that created a shared household hands it to the longest member instead of refusing.
- **Transparency**: when the admin replaces the password of an active account (directly or by reset link), the person sees a notice on the start page for 14 days and permanently under *Settings*.

### Fixed

- **Country flags on Windows**: flags are shown as flags instead of letters ("IT") – a small flag font is served by Packwise itself and only loaded on systems without flag emojis.
- **Brave**: the hint about Shields now only appears in Brave, and also when the live connection of a trip stays blocked (once per session).
- **Household**: travellers and bags save themselves on every change (a short "Saved" confirms it) – no more save button per row; on phones a row takes two lines at most. To-dos in a trip show their due date under the name on phones.
- Wording: "1 trip", "1 day, 0 nights" instead of plural forms; page titles for *Forgot password*, *New password* and invitations; buttons and fields without a visible label (✕, +, add forms) now have one for screen readers.
- Old entries of the reminder log are cleaned up after two months.
- Groups (categories) of a trip can be renamed again: tap the group name to edit it. A renamed group can be taken over into the template with ⟳, and the editor now says *group* instead of *item*.
- Printing: no more empty last page; progress rings, counters and other screen-only elements are left out; large categories continue in the next column instead of leaving half-empty pages.

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
