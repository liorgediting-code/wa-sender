# WA Bulk Sender

Send WhatsApp messages to a list of numbers via Green API. Collect leads via a
webhook into a saved list. Hosted on Vercel.

## Features
- **Password gate** — the UI asks for a password (`liav`) on every load.
- **Bulk send** — paste numbers (one per line), set a delay, send via Green API.
- **Israeli number support** — `05X…` numbers are auto-converted to `972…`
  international format (fixes Green API error 400). Full `972…` numbers also work.
- **Webhook → saved leads** — an open endpoint accepts leads from a form/CRM and
  stores them in Postgres so they persist for future messaging.

## Deploy

### 1. Deploy to Vercel
Import the repo at vercel.com → New Project → Deploy.

### 2. Add a Postgres database (required for the webhook/leads feature)
In the Vercel project → **Storage** → **Create Database** → choose **Neon
(Postgres)** (or another Postgres provider) → **Connect** it to this project.
This adds a `POSTGRES_URL` / `DATABASE_URL` env var automatically.

Then **redeploy** so the app picks up the env var. The `leads` table is created
automatically on first use — no migration needed.

> Without a database, sending still works; only the webhook/saved-leads feature
> is disabled (returns "Database not configured").

### 3. Share the URL
Each person enters their own Green API credentials — saved in their own browser's
localStorage, never stored on the server (only forwarded to Green API).

## Webhook — adding leads

Point a form, Zapier, Make, n8n, or any tool at:

```
POST https://<your-app>.vercel.app/api/webhook
Content-Type: application/json

{ "phone": "0559218603", "name": "Liav" }
```

- **Open endpoint** (no secret) — anyone with the URL can add a lead.
- Accepts `phone` in `05X…` or `972…` format (both normalized).
- Tolerant of field names: `phone` / `phoneNumber` / `tel` / `mobile` / `number`,
  and `name` / `fullName` / `firstName`.
- Accepts JSON **or** form-encoded bodies; **CORS enabled** so a browser form on
  any domain can post directly.

Quick test:
```bash
curl -X POST https://<your-app>.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"phone":"0559218603","name":"Test"}'
```
Then click **↻ Refresh** in the Saved Leads section.

## Managing leads in the UI
- **Saved Leads** section lists everything the webhook collected (`name · phone`),
  with ✕ to remove a lead and **Clear all**.
- **"Load … into recipients ↓"** copies saved numbers into the recipients box
  (skipping duplicates) so they flow into the normal send.
- Leads live in Postgres and are **shared** across everyone who opens the URL
  (the server receives the webhook, not a browser).

## API routes
- `POST /api/send` — proxies `{ instance, token, chatId, message }` to Green API.
- `POST /api/webhook` — open; adds a lead `{ phone, name }` to the list.
- `GET /api/leads` — returns saved leads. Requires `x-app-password: <password>`.
- `DELETE /api/leads?phone=…` or `?all=true` — remove leads. Same header.

## Configuration
- **Password** — defaults to `liav`. Override the server-side check with an
  `APP_PASSWORD` env var. (The UI password constant lives in `app/page.tsx`.)
- **Database** — connection string read from `POSTGRES_URL`, `DATABASE_URL`,
  `POSTGRES_PRISMA_URL`, or `POSTGRES_URL_NON_POOLING`.

## Local dev
```bash
npm install
npm run dev
```
Set `POSTGRES_URL` (or `DATABASE_URL`) in `.env.local` to exercise the webhook
locally.
