<p align="center"><img src="static/favicon.svg" width="72" alt="Packwise logo"></p>

<h1 align="center">Packwise</h1>

<p align="center">Self-hosted, collaborative packing lists – one template, smart trips, packed together in real time.</p>

---

Packwise replaces the packing list in your notes app. You maintain **one template** for your household. For every trip, Packwise **generates a packing list** from it: based on the destination, travel dates, weather, how you travel and who comes along. Everyone opens the same link and checks items off **live**. Anything you add or remove on a trip can go **back into the template** with one tap, so the list gets better with every holiday.

## Features

- **Template with up to three levels**: category › subcategory › item group. Items can sit at any level. Supports drag & drop, inline editing and search.
- **Smart chips per item**: tap once for *only with*, twice for *never with*. For example, the coffee machine comes along for *car + holiday home* and *never* for *plane*. Dimensions:
  - Getting there
  - Accommodation
  - Activities
  - Climate (automatic)
  - Season (automatic, aware of the southern hemisphere)
  - Destination: domestic / EU / outside the EU (automatic)
  - Travelling with: baby / kids / pet (automatic)
- **Quantity rules**: fixed, per day or per night, plus extra and a maximum. A *laundry available* switch caps clothing. Items can be marked *once per traveller* (e.g. toothbrush).
- **People ≠ accounts**: kids and pets are people without a login. Items assigned to a person only come along when that person travels, so each person gets their own base set (glasses, medication, cuddly toy).
- **Bags with colours**: Suitcase 1 is blue, Suitcase 2 is green, carry-on is orange. Items are tinted by bag, and the trip can be viewed by category, bag or person.
- **Weather from [Open-Meteo](https://open-meteo.com)** (no API key):
  - Up to 16 days ahead it uses the real forecast. Further out it uses the average of the same days over the last 10 years.
  - It warns about implausible plans, e.g. skiing at 22 °C, or rain expected but nothing tagged for rain.
- **Plug adapters and voltage**: built-in table of about 200 countries. Packwise knows that a German Europlug fits in Italy but a Schuko plug does not fit in Switzerland. It suggests the right adapter type and the number needed. Devices marked ⚡ get a voltage warning (e.g. 120 V in the US).
- **Road-trip hints** (car / camper only): vignettes (AT, CH, SI, CZ, SK, HU, RO, BG), Crit'Air, Umweltplakette, safety kit, Green Card, beam deflectors, winter equipment. Shown as suggestions without guarantee.
- **Currency hint**: e.g. cash in GBP when the destination uses a different currency.
- **Live collaboration** via Server-Sent Events: see who is online, with an activity log of who packed what.
- **To-dos before departure** (optional per trip): water the plants, online check-in, empty the fridge. Each to-do has a due date relative to departure and uses the same chips as items, so "Online check-in" only appears for flights. Kept in its own to-do template.
- **Return-trip mode**: a second checkmark for "packed again", so nothing is left in the holiday home. Consumables like sunscreen are left out. The trip suggests it on the last day.
- **Offline mode**: installable PWA. Open lists keep working without a connection. Checks, new items and to-dos are queued and synced automatically once you're back online.
- **Template sync**: *↑ Template* on new items. On delete, Packwise asks *only this trip* or *also from the template*. Changed items can update the template.
- **Import with review step**: plain text, Markdown, `.txt` files, OneNote / Word pastes (nested lists are kept) and Packwise JSON. You check every line, fix levels and untick duplicates before anything is saved.
- **Share**: link, QR code and the native share sheet. Print view in two columns.
- **Themes**: light, dark, **AMOLED (true black)** and system.
- **Languages**: English and German built in. Drop more into `/data/locales` (see below).
- **Tiny footprint**: one container, SQLite, about 25 MB RAM at idle. Images for amd64 and arm64.

## Quick start (Docker Compose / Portainer)

In Portainer: **Stacks → Add stack**, paste this, then deploy.

```yaml
services:
  packwise:
    image: ghcr.io/jake-double-one/packwise:latest
    container_name: packwise
    restart: unless-stopped
    ports:
      - "8080:3000"
    volumes:
      - ./data:/data
    environment:
      TZ: Europe/Berlin
      AUTH_MODE: local          # none | local | accounts
      APP_PASSWORD: change-me   # for AUTH_MODE=local
      DEFAULT_LANG: en          # en | de
```

Open `http://<host>:8080`. The setup wizard asks for your name, household, home country and whether to start with a ready-made template.

Without Portainer: `docker compose up -d` with the [`docker-compose.yml`](docker-compose.yml) from this repo.

## Login modes (`AUTH_MODE`)

| Mode | Behaviour | Good for |
|---|---|---|
| `none` | No login at all. Open the page and you're in. With several profiles, you pick yours once per device. | LAN only, or behind Authentik / Authelia / a VPN |
| `local` *(default)* | One shared password (`APP_PASSWORD`, or set in the setup wizard), then straight in. | Families, small setups |
| `accounts` | Users with e-mail and password. Households with roles (owner / member / packer), invite links, password reset by e-mail or by admin link. | Open on the internet, friends and other families |

In every mode, **profiles / users ≠ people**. People are who you pack for; profiles are who is clicking.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `AUTH_MODE` | `local` | `none`, `local` or `accounts` |
| `APP_PASSWORD` | – | Shared password for `local`. If empty, the setup wizard asks for one. |
| `REGISTRATION` | `invite` | `accounts` only: `closed` (admin creates users), `invite` (invite links) or `open` |
| `DEFAULT_LANG` | `en` | Fallback language when the browser's language is not available |
| `DEFAULT_COUNTRY` | – | Home country pre-selected in setup (ISO code, e.g. `DE`) |
| `ORIGIN` | – | Public URL, e.g. `https://packwise.example.com`. Used for links in e-mails and to decide about secure cookies. Recommended behind a reverse proxy. |
| `PUID` / `PGID` | `1000` | User / group the app runs as. `/data` is chowned automatically. |
| `WEATHER_ENABLED` | `true` | Set to `false` to never contact Open-Meteo |
| `SESSION_DAYS` | `90` | Login lifetime |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | – | Optional e-mail for invitations and password resets |
| `ADDRESS_HEADER` | – | e.g. `X-Forwarded-For` behind a proxy, so login rate limiting sees real client IPs |
| `BODY_SIZE_LIMIT` | `512K` | Raise it if you import very large lists |

### Reverse proxy notes

Packwise works behind Traefik, Nginx Proxy Manager, Caddy and Authentik without extra settings. Live updates use Server-Sent Events. If your proxy buffers responses, disable buffering for `/api/*/live` (Packwise already sends `X-Accel-Buffering: no` for Nginx).

## Troubleshooting

**Brave browser: some functions don't work.** With Brave Shields active, some requests can be blocked (Brave's filter lists also apply to self-hosted apps). Open Packwise, tap the Brave lion icon in the address bar and turn **Shields off for this site**. The setting is remembered per domain. Packwise loads no ads, trackers or third-party scripts, so nothing is lost.

**Live updates don't arrive behind a reverse proxy.** Disable response buffering for `/api/*/live` (Server-Sent Events).

## Adding a language

Copy [`src/lib/i18n/en.json`](src/lib/i18n/en.json) to `data/locales/<code>.json` (e.g. `fr.json`), translate the values, set `"_name": "Français"` and restart the container. The language then appears in the settings. You can also override single keys of English or German this way.

## Backup

Everything lives in `./data` (SQLite in WAL mode, so stop the container or copy all `packwise.db*` files together). Under **Template → Import → Backup** you can also download a JSON export of a household. Its template part can be imported again.

## Development

```bash
npm install
npm run dev        # http://localhost:5173 (data in ./data)
npm test           # unit tests (generation engine, importer, locales)
npm run check      # type check
npm run build && node build
```

Stack: SvelteKit 2 / Svelte 5, Node's built-in `node:sqlite` (no native dependencies), Server-Sent Events, scrypt password hashing.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for what's done and what's planned next.

---

## 🇩🇪 Kurzanleitung

1. Den Compose-Block oben in Portainer als Stack einfügen. `APP_PASSWORD` ändern und `DEFAULT_LANG: de` setzen.
2. `http://<server>:8080` öffnen. Der Einrichtungsassistent fragt Name, Haushalt, Heimatland und Starter-Template ab.
3. Unter **Template** die eigene Liste pflegen oder unter **Import** die OneNote-Liste einfügen. Vor dem Speichern wird alles geprüft.
4. **Neue Reise**: Ziel, Datum, Mitreisende, Anreise und Unterkunft wählen. Die Vorschau zeigt, was warum eingepackt wird, und bezieht Wetter, Adapter und Vignetten mit ein.
5. Den Link oder QR-Code teilen und gemeinsam abhaken. Mit **↑ Template** landen neue Artikel fürs nächste Mal im Template.
6. Optional die **To-dos vor der Abfahrt** einschalten. Für die Heimreise auf **🏠 Rückreise** umschalten. Abhaken funktioniert auch **offline**.

**Brave-Browser:** Falls Funktionen nicht gehen, für die Packwise-Adresse die Shields deaktivieren (Löwen-Symbol in der Adressleiste).

Login-Modi: `AUTH_MODE=none` (ohne Login), `local` (ein gemeinsames Passwort, Standard) oder `accounts` (Konten mit E-Mail und Passwort, Einladungen, SMTP).
