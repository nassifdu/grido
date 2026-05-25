# Grido

A Next.js dashboard for analyzing product stock from Bling ERP. Displays inventory as interactive pivot tables (color × size grids) with real-time sync from Bling's catalog.

## Features

- **Product Search:** Search Bling products and view stock availability
- **Pivot Tables:** Analyze stock as color × size grids with real-time subtotals
- **Catalog Sync:** Stream product data from Bling to Supabase cache with progress tracking
- **Multi-widget:** Pin multiple product widgets simultaneously on the dashboard
- **Authentication:** Bling OAuth with encrypted token storage

## Getting Started

### Prerequisites

- Node.js 18+
- A Bling ERP account with OAuth credentials
- Supabase project (cloud or local CLI)

### Setup

1. **Clone and install:**
   ```bash
   npm install
   ```

2. **Environment variables:** Copy required vars into `.env.local`:
   ```
   BLING_CLIENT_ID=<your-client-id>
   BLING_CLIENT_SECRET=<your-client-secret>
   BLING_REDIRECT_URI=http://localhost:3000/api/auth/callback
   SUPABASE_URL=<your-supabase-url>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   SESSION_SECRET=<random-secret>
   TOKEN_ENCRYPTION_KEY=<64-char-hex-key>
   ```

3. **Database migrations:** Run SQL migrations in your Supabase project:
   ```bash
   supabase/migrations/001_bling_tokens.sql
   supabase/migrations/002_catalog_cache.sql
   ```

4. **Seed local data (optional):**
   ```bash
   npx tsx scripts/seed-catalog.ts
   ```

5. **Start dev server:**
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development

```bash
npm run dev      # Start development server
npm run build    # Production build (includes type check)
npm run start    # Serve production build
```

## Project Structure

- `app/api/` — Next.js API routes (auth, catalog, sync)
- `app/dashboard/` — Authenticated pages
- `lib/` — Shared utilities (Bling client, catalog queries, auth, crypto)
- `supabase/` — Database migrations
- `data/` — Local product snapshots for seeding

See [CLAUDE.md](./CLAUDE.md) for detailed architecture and development notes.

## License

Private project.
