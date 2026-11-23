# Terminallike

A **TRMNL-inspired 4K TV screensaver website** built for the **Google TV Streamer 4K** that displays a calm daily calendar and an AI-generated editorial summary of the day.

Designed with zero runtime dependencies (pure Node.js + Vercel serverless functions + Vanilla HTML/CSS/JS) and styled around two living-room themes: **Classic TRMNL Paper E-Ink** (warm archival paper) and **OLED-Safe Ink** (true `#000000` black with low-glare warm bone typography).

---

## Features

- **Zero-Dependency Architecture** — Pure Node.js HTTP server (`server.js`), Vercel serverless API (`/api/briefing`, `/api/geocode`, `/api/health`), and static `public/` frontend with zero npm packages.
- **Multi-Feed Private `.ics` Parser** — Connects Google Calendar and Apple iCloud (`webcal://` or `https://`) feeds with full RFC 5545 support: recurring `RRULE` (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`, `BYDAY`, `BYMONTHDAY`, `COUNT`, `UNTIL`), `EXDATE` exclusions, `RECURRENCE-ID` overrides, `STATUS:CANCELLED`, all-day events, and IANA/Windows timezone handling.
- **Realistic Demo Mode** — Works immediately out of the box with a time-aware sample schedule until `ICS_URLS` is configured.
- **AI Daily Summary** — Supports **Google Gemini**, **OpenAI**, and **Anthropic Claude** with SHA-256 content-hash TTL caching and a smart zero-dependency local fallback.
- **Free Local Weather & Sunset** — Powered by [Open-Meteo](https://open-meteo.com/) (no API key required) including current temperature, high/low, condition icon, sunrise/sunset times, and live city lookup.
- **4K TV & OLED Ergonomics**:
  - **Auto-at-Sunset Theme** — Switches automatically from TRMNL Paper E-Ink by day to OLED-Safe Ink after local sunset.
  - **OLED Burn-In Pixel Shift** — Subtly orbits the canvas by a few pixels every 2 minutes.
  - **Idle Cursor & Controls Auto-Hide** — Hides the cursor and corner controls after 5 seconds of inactivity.
  - **Screen Wake Lock** — Uses the Screen Wake Lock API to keep the display awake.
  - **Up Next Spotlight**, **Day Rhythm Bar (7 AM–9 PM)**, **Tomorrow Preview**, **Optional Personal Note**, and a **Settings Drawer (`S`)** with Open-Meteo city lookup.

---

## Quick Start (Local)

Requires **Node.js 20+** (zero `npm install` needed).

```bash
cp .env.example .env
npm start
```

Open `http://localhost:3000` in your browser. Until you add `ICS_URLS` to `.env`, the display runs in **Demo Mode**.

Run the test suite:

```bash
npm test
```

---

## Connecting Private Calendars (`.ics`)

Set `ICS_URLS` in `.env` (or Vercel Environment Variables). You can pass multiple feeds separated by commas or newlines, and optionally prefix each URL with `Label|`:

```env
ICS_URLS=Personal|https://calendar.google.com/calendar/ical/abc123/private-xyz/basic.ics,Work|webcal://p123-caldav.icloud.com/published/2/def456
```

### Google Calendar
1. Open [Google Calendar](https://calendar.google.com) on desktop.
2. Hover over the calendar in the left sidebar → click **⋮ → Settings and sharing**.
3. Scroll to **Integrate calendar** and copy **Secret address in iCal format** (ends in `.ics`).

### Apple iCloud Calendar
1. Open the **Calendar** app on iPhone/Mac (or [icloud.com/calendar](https://www.icloud.com/calendar)).
2. Click the share icon next to the calendar → enable **Public Calendar**.
3. Copy the `webcal://...` link (Terminallike automatically converts `webcal://` to `https://`).

---

## Deploying to Vercel

1. Push this repository to GitHub (or import `Chriswood12/Terminallike` in the [Vercel Dashboard](https://vercel.com/new)).
2. Framework Preset: **Other** (leave Build Command empty; Vercel automatically serves `public/` and compiles `api/*.js` as serverless functions).
3. Add your Environment Variables in **Project Settings → Environment Variables**:

| Variable | Required | Description |
| --- | --- | --- |
| `PERSON_NAME` | No | Name used in greeting and AI summary (default: `Maya`) |
| `PERSONAL_NOTE` | No | Optional warm note displayed on screen |
| `ICS_URLS` | No | Comma/newline separated `.ics` URLs (`Label\|https://...`). Empty = Demo Mode |
| `LOCATION_NAME` | No | City display label (default: `San Francisco, CA`) |
| `LOCATION_LAT` / `LOCATION_LON` | No | Coordinates for Open-Meteo weather & sunset |
| `TIMEZONE` | No | IANA timezone (e.g. `America/Los_Angeles`, `America/New_York`) |
| `WEATHER_UNITS` | No | `fahrenheit` or `celsius` |
| `AI_PROVIDER` | No | `auto`, `gemini`, `openai`, `anthropic`, or `none` |
| `GEMINI_API_KEY` | No | Google AI Studio API key (default model: `gemini-2.5-flash`) |
| `OPENAI_API_KEY` | No | OpenAI API key (default model: `gpt-4o-mini`) |
| `ANTHROPIC_API_KEY` | No | Anthropic API key (default model: `claude-3-5-haiku-latest`) |
| `AI_MODEL` | No | Optional model override |
| `AI_CACHE_MINUTES` | No | Minutes to cache AI summary (default: `45`) |

4. Deploy — your live URL (e.g., `https://terminallike.vercel.app`) is ready for your TV.

---

## Google TV Streamer 4K Setup

### Option 1: Fullscreen Display (Quickest — TV Bro)
1. On your **Google TV Streamer 4K**, install **TV Bro** (free, open-source Android TV browser) from the Google Play Store.
2. Open TV Bro and navigate to your deployed Vercel URL (e.g. `https://your-app.vercel.app`).
3. Bookmark it as your homepage and enable **Fullscreen Mode** in TV Bro settings.
4. After 5 seconds of inactivity, the cursor and corner controls automatically fade away.

### Option 2: True Android TV Screensaver (Auto-launches when idle)
1. Install **WebView Screensaver** or **Fully Kiosk Browser** (or sideload **Dashboard Screensaver** for Android TV).
2. Set the screensaver URL to your deployed Vercel URL.
3. On Google TV, go to **Settings → System → Ambient Mode** (or use `adb shell settings put secure screensaver_components ...` if using a custom DreamService screensaver) to set it as your active screensaver.
4. In Terminallike's **Settings Drawer (`S`)**, keep **OLED Burn-In Pixel Shift** enabled and set **Theme Mode** to **Auto at Sunset** (or **OLED-Safe Ink** for OLED TVs).

---

## Keyboard & Remote Shortcuts

| Key | Action |
| --- | --- |
| `S` | Open / close Settings drawer (with city lookup) |
| `T` | Cycle theme (`Auto at Sunset` → `TRMNL Paper` → `OLED-Safe Ink`) |
| `R` | Force refresh calendar, weather, and summary |
| `Esc` | Close Settings drawer |
