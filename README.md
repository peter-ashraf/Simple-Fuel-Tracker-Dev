# Simple Fuel Tracker Dev

This is the development/staging copy of **Simple Fuel Tracker**.

Use this repo for risky UI, PWA, cloud-sync, maintenance, and restore experiments. Do not treat this as the production app.

## Safety Notes

- Production source repo: `https://github.com/peter-ashraf/Simple-Fuel-Tracker.git`
- Production local path used to create this copy: `F:\Peter\Practice\Fuel-Tracker`
- This dev repo is intentionally independent and should not use the production remote.
- Cloud/Supabase is disabled by default.
- Do not add production `.env` secrets here.
- Use a separate Supabase dev project before enabling cloud sync.

## Local Setup

```bash
npm install
npm run dev
```

The app runs in local dev mode by default. It uses the storage prefix from `VITE_STORAGE_PREFIX`, defaulting to `sft-dev`, so browser data is isolated from production.

## Environment

Copy `.env.example` to `.env` only when needed.

```env
VITE_APP_ENV=development
VITE_STORAGE_PREFIX=sft-dev
VITE_CLOUD_ENABLED=false
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

To test cloud sync, create a separate Supabase dev project and set:

```env
VITE_CLOUD_ENABLED=true
VITE_SUPABASE_URL=<dev project url>
VITE_SUPABASE_ANON_KEY=<dev anon key>
```

## Deployment

This repo is prepared for GitHub Pages at:

```text
https://peter-ashraf.github.io/Simple-Fuel-Tracker-Dev/
```

Do not connect this repo to the production remote. Create a separate GitHub repository named `Simple-Fuel-Tracker-Dev` when ready.

## Resetting Dev Data

The dev build patches `localStorage.clear()` so it only clears keys prefixed by the dev storage prefix. It should not remove production `fueltracker-*` data from the same browser origin.

## Validation Checklist

- App title says `Fuel Tracker Dev`.
- Dev banner appears when cloud is disabled.
- localStorage keys are prefixed with `sft-dev-`.
- Supabase calls are not made while `VITE_CLOUD_ENABLED=false`.
- Build output uses `/Simple-Fuel-Tracker-Dev/`.
- PWA/cache identity is dev-specific.
