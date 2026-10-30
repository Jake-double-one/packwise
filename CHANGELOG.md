# Changelog

All notable changes to Packwise. Docker images: `ghcr.io/jake-double-one/packwise:<version>`.

## Unreleased

### Added

- **To-dos before heading home**: the return tab has its own to-do list (check-out, look through the room), with due dates counting down to the end of the trip. It works like the list before departure: its own section in the to-do template, chips, reminders on the due day, *to template* and offline. Starter template gets two of them. A trip made before a to-do was added to the template offers *Add from template* in the list.
- **Fold away what you don't use**: on the return tab the packing list and the to-dos can be folded; on the packing tab the to-dos. The state is kept for the whole household (it is a preference, not a view) and folded parts don't count towards the progress. To-dos can be hidden again on a trip (they were only switchable on).
- **To-dos on a trip can be edited**: tapping one opens name, due day, who and note (both lists). The to-do field has a `+` button, so adding doesn't depend on the keyboard.
- **One progress for list and to-dos**: the ring on the trip and on the overview counts items and the to-dos of the current phase together.
- **Weather at home on the way back**: the household can set a **home town** (place search; it also sets the home country). The return tab then shows the weather at home for the arrival day and the two days after.
- **Share a trip as text**: the print button opens a small menu – *Print* or *Share as text*. The text is Markdown with the list exactly as it stands (categories, quantities, ticks, who, used-up consumables) and the to-dos of the current phase; it goes to the phone's share sheet, the clipboard or a `.md` file. The importer reads the same format.
- **Import from another household**: *Import → Another household* shows the template of one of your other households as a tree. Tick categories or single items and they are copied with quantity, quantity rule, chips, power and consumable flags and notes. People and bags are matched by name (otherwise the item is for everyone / without a bag). Only your own households are offered; for anything else there is still the JSON backup.

### Changed

- **The trip's weather summary is refreshed** when somebody opens the trip while the forecast reaches it (16 days ahead) and the stored copy is older than six hours – before, it was fetched once when the trip was made, so a trip planned months ahead kept the climate average. Nothing is fetched in the background or for trips that are over.

### Fixed

- Enter in a trip's *New to-do…* field adds the to-do – it did nothing, because the form had no button.
- **Print view in dark mode**: boxes, borders and grey text printed in the dark colours (black boxes to tick). The paper is now always light, whatever theme is on.
- **Print view page breaks**: a category is no longer torn across columns or pages. The left column is filled first, and while printing the cards are reordered so that a smaller category fills the space a bigger one left over at the bottom of a column (the screen order stays as it is). Only a category taller than a whole column is still split.

- **Install as an app**: *Settings → Install as an app* offers Chrome's install prompt as a button, explains the home-screen steps on iPhone/iPad and says why installing is unavailable over `http://`. The manifest is fetched with cookies, so a login proxy in front of Packwise no longer breaks installation; a solid maskable icon for Android's icon shapes; app shortcuts *New trip* and *Trips* in the user's language.
- **Status bar and app title bar follow the theme** (light, dark, AMOLED, system) in a browser tab – before, they were always indigo. In the installed app the Android system bars follow the phone's light/dark mode (no fixed `theme_color` in the manifest any more, no `viewport-fit=cover`), so the bottom bar is no longer stuck white; a dark theme on a dark phone keeps its colour. The splash screen follows the theme. Native form controls follow as well (`color-scheme`).
- **Push notifications show the Packwise bag in Android's status bar** instead of a white square (monochrome badge icon).

### Security

- **Dependency audit**: a weekly GitHub workflow runs `npm audit` for the shipped packages and a Trivy scan of the built image (Alpine base and node_modules), with results under *Security → Code scanning*; Dependabot opens weekly update PRs for npm packages, GitHub Actions and the Node base image.
- **Security headers and a Content-Security-Policy** on every page (own scripts and assets only, OpenStreetMap iframe, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policy).
- **Servers entered by users** (ntfy, Gotify, SMTP, push subscriptions) may no longer point at the container itself or at link-local / cloud-metadata addresses; names are resolved and checked on every send. LAN addresses stay allowed.
- **`ORIGIN` warning**: with `accounts` and no `ORIGIN`, the log and the admin area warn that links in e-mails are built from the request's Host header.
- Changing your own password logs out your other devices. Login takes the same time for unknown e-mail addresses as for wrong passwords. API tokens use unbiased random characters. Caps for the rate-limit table and open live connections.
- **Findings of a security review fixed** (none of them changes how Packwise is used):
  - *Switching login modes*: with `AUTH_MODE=local` only the shared password opens the app – a session left over from `accounts` no longer does. Outside `accounts`, account sessions and outstanding reset and invitation links are removed at start, and `/reset` and `/forgot` are off.
  - *Before login* the page data no longer contains the household's name (`local`, `accounts`).
  - *Live updates* end as soon as the session is gone or access was taken away (logged out by the admin, removed from the household or the trip), instead of streaming on until the browser disconnects; at most 30 open live connections per person.
  - *Invitation links* end when the person who made them leaves or is removed from the household (links made from now on). Two registrations can no longer use one invitation link at the same time.
  - *When the administration replaces someone's password* (directly or with a reset link), that person's API tokens end too. Using a reset link removes the person's other reset links; so does changing your password. Changing an account's e-mail address in the admin area ends reset links sent to the old address.
  - *SMTP*: the stored password is only sent to the server and user it was entered for – after changing the server or the user name, or switching encryption off, it has to be typed in again.
  - *Links in notifications* use the address each person last opened Packwise with, not one address for everybody that any request could set (unless `ORIGIN` is set, which always wins).
  - *Outgoing requests*: IPv4 addresses written in IPv6 hex form (`[::ffff:7f00:1]`) are recognised as the address they stand for and blocked like `127.0.0.1`. Web Push endpoints are checked again on every send.
  - *MCP*: a JSON-RPC batch holds at most 50 calls and runs them one after the other; `create_trip` accepts only known country codes and caps the trip name.
  - *Import*: merging is linear in the size of the template (was quadratic) and capped at 20,000 entries and 32 levels.
  - Redirect targets after login are normalised the way the browser reads them; emoji avatars can't contain URL characters.
  - *Offline copies*: when the server says a device is logged out (session expired, logged out on another device or by the admin), the lists kept for offline use are deleted on the next online visit – not only when logging out on that device. Login and invitation pages are no longer cached.
  - *Offline changes are kept per person*: changes made without a connection are only sent for the person who made them, also when someone else uses the device in between; nothing is lost (a queue from before the update goes to the first person who opens the trip). If the session ended in the meantime, the changes wait for the next login instead of being dropped.
  - *Login attempts*: a flood of requests can no longer reset the limit on password guessing – when the table is full, expired and harmless counters are forgotten first, blocked ones stay. Expired counters are swept at most once a minute instead of on every request.
  - `docker-compose.yml` no longer ships `APP_PASSWORD: change-me` (the setup wizard asks for the password; a warning is logged if `change-me` is still in use) and lists `TZ` only once.

### Changed

- **Trip info**: on the desktop the map grows with the notes next to it, so there is no empty space below it.
- **By car**: speed limits and the alcohol limit are always shown at a glance; child seats and the country's specialities fold out below.
- **By car – cannabis at the wheel**: next to the alcohol limit, the legal THC limit for drivers where there is one (e.g. Germany 3.5 ng/ml and none for novice drivers, Netherlands 3 ng/ml or 1 ng/ml with alcohol, Czechia 2, UK 2, Switzerland 1.5, Norway 1.3, Belgium, Denmark, Ireland and Luxembourg 1; USA depending on the state), otherwise *forbidden*.
- **Node.js 26**: the Docker image and the CI run on Node 26, the active LTS line until April 2029 (Node 24 moved to maintenance in October 2026). Running from source needs Node 22.17 or newer, as SvelteKit 3 requires.
- **SvelteKit 3.1, adapter-node 6**: the app runs on the current SvelteKit major. Configuration moved from `svelte.config.js` into `vite.config.ts`, `$lib` imports became Node subpath imports (`#lib/…`), environment variables are declared in `src/env.ts`, the service worker lives in `src/service-worker/` with its own TypeScript project, and the deprecated `json()` / `invalidateAll()` helpers were replaced. No change in behaviour or configuration: `ORIGIN`, `ADDRESS_HEADER`, `BODY_SIZE_LIMIT` and the other variables work as before (adapter-node itself no longer reads `ORIGIN`; Packwise uses it for links in e-mails and secure cookies as documented). The `cookie` library in SvelteKit is now v2, which clears the last `npm audit` findings. TypeScript stays on 6.x: the 7.0 compiler ships no JavaScript API yet, which `svelte-check` and SvelteKit need.
- **Dependencies updated**: Svelte 5.57.2, svelte-check 4.7.7, Vite 8.3.4, Vitest 5.0.5, nodemailer 10.1.7, Node type definitions; the CI workflows run on the current major versions of the GitHub and Docker actions (Node 24 runtime).
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
