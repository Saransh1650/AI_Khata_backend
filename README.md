# AI Khata — MVP

Retail Analytics AI System. Scan bills via OCR (Gemini Vision), add entries manually, and get AI-powered forecasts, inventory alerts, and festival recommendations.

---

## Quick Start

### Backend

```bash
cd AI_Khata_backend

# 1. Copy env file and fill in your values
cp .env.example .env
# Edit .env: set GEMINI_API_KEY, JWT_SECRET

# 2a. Run with Docker Compose (recommended)
docker-compose up

# 2b. Or run locally (need PostgreSQL running)
npm install
npm run init-db   # create tables
npm start         # starts on port 3000
```

### Flutter App

```bash
cd AI_Khata/ai_khata

# .env is already set to http://localhost:3000
# For prod: edit .env → API_BASE_URL=https://your-api.com

flutter pub get
flutter run
```

---

## Project Structure

```
AI_Khata_backend/
  src/
    config/       env.js, database.js, gemini.js, init.sql
    auth/         register, login (name + password)
    stores/       onboarding store setup
    bills/        OCR upload + manual entry
    ledger/       CRUD entries + line items
    analytics/    sales trends, product rankings, activity
    ai/           forecast, inventory, festival recs
    workers/      ocrWorker, forecastWorker, inventoryWorker

AI_Khata/ai_khata/lib/
  core/           theme, constants, api_client
  features/
    auth/         login + register screen
    onboarding/   store type picker, store details, done
    dashboard/    stats cards + bottom nav shell
    bills/        list, OCR scanner, manual entry form
    ledger/       searchable entries list
    analytics/    sales line chart, product bar chart
    insights/     festival cards, forecast chart, alerts
```

## Local ↔ Prod Switching

| | Local | Prod |
|---|---|---|
| **Backend** | `.env` file | Platform env vars (same vars) |
| **Flutter** | `.env` → `http://localhost:3000` | `.env` → `https://api.yourapp.com` |

No code changes needed — only swap the `.env` files.

## AI Features (Gemini 1.5-flash)

| Feature | How |
|---|---|
| Bill OCR | Image → Gemini Vision → structured JSON |
| Demand Forecast | 90-day sales → Gemini → 30/60/90-day prediction |
| Inventory Analysis | Product velocity → Gemini → stockout alerts |
| Festival Recs | Last-year festival sales + store type → Gemini → per-product uplift |
