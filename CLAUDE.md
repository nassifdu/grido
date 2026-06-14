# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## TL;DR

**Grido** is a Next.js dashboard that connects to Bling ERP, caches product data in Supabase, and renders stock pivot tables (color × size grids). You can:
- Search products via Bling → display as pivot grid
- Sync Bling catalog to Supabase cache (SSE-streamed progress)
- Pin multiple pivot widgets simultaneously on the dashboard
- Auth is handled via Bling OAuth + encrypted token storage

## Language Standards

- **Backend** (API routes, lib utilities): English (e.g., `Catalog`, `searchProducts`, comments, variable names)
- **Frontend** (UI components, pages): Portuguese (e.g., `Estoque`, `Subtotal`, user-facing labels and strings)
- **Database**: Portuguese table/column names (e.g., `bling_produtos`, `bling_variacoes`, `id_produto_pai`)

Keep backend logic language-agnostic; internationalize UI strings as the product scales.

## Getting Started

**Requirements:** Node.js 18+

1. **Set up environment:** Copy the required vars from the Env Vars section into `.env.local`
2. **Migrations:** Run these SQL migrations in your Supabase project (cloud or local CLI):
   - `supabase/migrations/001_bling_tokens.sql` — OAuth token storage table
   - `supabase/migrations/002_catalog_cache.sql` — Product and variation cache tables
   - `supabase/migrations/003_sync_metadata.sql` — Sync status tracking table
3. **Seed data:** `npx tsx scripts/seed-catalog.ts` (reads `data/produtos.json` and `data/variacoes.json`)
4. **Dev server:** `npm run dev` → http://localhost:3000

## Commands

```bash
npm run dev      # start dev server on localhost:3000
npm run build    # production build (also type-checks)
npm run start    # serve production build
```

No test runner or lint script configured.

## Project Structure

```
app/
  api/              # Next.js API routes (auth, catalog, sync)
  dashboard/        # Authenticated pages
  page.tsx          # Landing page
lib/
  bling.ts          # Bling API client (token mgmt, auto-refresh)
  catalog.ts        # Product search & pivot queries
  crypto.ts         # AES token encryption
  session.ts        # JWT session verification (no library)
  supabase.ts       # Supabase client singleton
  transform.ts      # Bling data → flat format (cached 30s)
supabase/
  migrations/       # SQL: tokens table, catalog cache tables
data/
  produtos.json     # Local product snapshot (for seeding)
  variacoes.json    # Local variation snapshot
```

## Scripts

**Seed catalog data**

```bash
npx tsx scripts/seed-catalog.ts
```

Reads `data/produtos.json` and `data/variacoes.json` and upserts them into `bling_produtos` / `bling_variacoes`. The tables must exist first (run migration 002_catalog_cache.sql). Useful for populating test data without syncing from Bling.

**Check stock & sync status**

```bash
node scripts/check-stock.mjs
```

Queries Supabase to inspect sync metadata and product/variation records. Searches `bling_produtos` and `bling_variacoes` for a specific product ID (`18883-0011` hardcoded in the script). Useful for debugging sync status and verifying product data structure.

## Debugging

**Check token refresh:** Look at `lib/bling.ts:blingFetch` — it auto-refreshes tokens <5 min from expiry. If seeing 401s, tokens likely expired; check Supabase `bling_tokens` table.

**Inspect Supabase data:** Query `bling_produtos` and `bling_variacoes` directly in Supabase dashboard. Cache results are in memory (30s TTL in `buildTransformed`).

**Catalog sync issues:** The `/api/catalog/sync` endpoint streams SSE progress and stores sync status server-side. Sync state is persisted in the `sync_metadata` table, so the UI recovers gracefully if the tab is backgrounded or the SSE stream closes. The `SyncButton` has fallback polling (every 2s) that detects when sync completes even if the stream is interrupted. The `SyncStatus` component on the dashboard shows the last sync time and current sync state, refreshing every 10s. Variations phase is sequential with 400ms delays (~10 min for ~970 products).

**Auth flow:** Login hits `/api/auth/login` (PKCE setup) → Bling OAuth → `/api/auth/callback` (token exchange + session cookie). Session JWTs are issued/verified in `lib/session.ts` with `blingUserId` in the `sub` claim.

## Environment Variables

Required in `.env.local`:

| Variable | Purpose |
|---|---|
| `BLING_CLIENT_ID` | Bling OAuth app client ID |
| `BLING_CLIENT_SECRET` | Bling OAuth app client secret |
| `BLING_REDIRECT_URI` | OAuth callback URL (e.g. `http://localhost:3000/api/auth/callback`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `SESSION_SECRET` | Secret for HMAC-signed session JWTs |
| `TOKEN_ENCRYPTION_KEY` | 64-char hex key used by `lib/crypto.ts` to AES-encrypt tokens at rest |

## Architecture

**Grido** is a Next.js App Router app that lets Bling ERP users analyse product stock as a pivot grid (cor × tamanho).

### Auth flow

1. `/api/auth/login` — generates PKCE verifier + challenge, redirects to Bling OAuth.
2. `/api/auth/callback` — exchanges code for tokens, persists them encrypted in Supabase (`bling_tokens` table), sets an HMAC-signed JWT cookie (`session`).
3. `lib/session.ts` — issues and verifies session JWTs (no library, pure Web Crypto). The `sub` claim is `blingUserId`.
4. All API routes call `getSession(request)` to extract `blingUserId`; unauthenticated requests get 401.

### Token storage

`lib/bling.ts` — `getBlingTokens` / `saveBlingTokens` / `refreshBlingTokens` manage Bling OAuth tokens in Supabase. Tokens are AES-encrypted at rest via `lib/crypto.ts`. `blingFetch` wraps all Bling API calls: it auto-refreshes the access token when <5 min from expiry and purges tokens from DB when the refresh token is revoked (forcing re-login).

### Product data pipeline

Bling product data is stored in two Supabase tables:
- `bling_produtos` — one row per product (`id bigint`, `data jsonb`)
- `bling_variacoes` — one row per variation (`id bigint`, `id_produto_pai bigint`, `data jsonb`)

`lib/transform.ts` (`buildTransformed`) paginates both tables from Supabase (1 000 rows per page) and merges them into a flat `TransformedItem[]`. Results are cached in memory with a 30-second TTL. The normalization logic in `fixVariacaoNome` converts messy Bling variation strings into `Cor:X;Tamanho:Y` format.

The catalog sync (`/api/catalog/sync`, POST) streams SSE progress events while it fetches from Bling and writes to Supabase. The variations phase is sequential with a 400 ms delay between requests (~10 min for ~970 parents). The `SyncButton` component reads the stream and renders a progress bar during the variations phase.

`lib/catalog.ts` builds on top of `buildTransformed` to expose:
- `searchProducts(query)` → `ProductSummary[]` (for the search dropdown)
- `getProductPivot(groupId)` → `ProductPivot` (cor × tamanho grid for one product group)

Size ordering: numeric sizes sort numerically; letter sizes follow a hard-coded fashion sequence (RN → PP → P → M → G → GG …).

### Sync metadata & status

The `sync_metadata` table tracks the status of catalog syncs:
- `bling_user_id` — unique per user
- `status` — 'idle', 'syncing', 'done', or 'error'
- `last_sync_at` — timestamp of the most recent successful sync
- `sync_started_at` — timestamp when the current (or most recent) sync began
- `error_message` — human-readable error, if status is 'error'

The `/api/catalog/sync/status` endpoint allows clients to poll sync state, enabling the UI to detect completion even if the SSE stream closes (e.g., tab backgrounded).

### API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/login` | GET | Initiate Bling OAuth (PKCE) |
| `/api/auth/callback` | GET | OAuth callback, set session cookie |
| `/api/auth/logout` | POST | Clear session cookie |
| `/api/catalog` | GET | Search products (`?q=&limit=`) |
| `/api/catalog/[parentId]` | GET | Pivot data for a product group |
| `/api/catalog/sync` | POST | SSE stream: fetch Bling → upsert Supabase, update sync_metadata |
| `/api/catalog/sync/status` | GET | Fetch current sync status for the authenticated user |
| `/api/bling/sync` | POST | Generic proxy: sync any Bling resource to Supabase |

### Frontend

**Key components:**

| Component | Location | Role |
|---|---|---|
| `CatalogShell` | `app/components/catalog/CatalogShell.tsx` | Page layout, navbar, `showSubtotals` toggle state |
| `CatalogView` | `app/components/catalog/CatalogView.tsx` | Renders the Estoque (stock) table grid |
| `SyncButton` | `app/components/catalog/` | Real-time sync progress, SSE listener with fallback polling |
| `SyncStatus` | `app/components/dashboard/` | Last sync timestamp and current status badge |
| `DashboardHeader` | `app/components/dashboard/` | Dashboard navbar; wraps account ID and SyncStatus badges |

**Page structure:**
- `app/dashboard/catalog/page.tsx` (server component) imports and renders `CatalogShell`
- `CatalogShell` manages the page layout, navbar, and `showSubtotals` state
- `CatalogView` renders the Estoque table and accepts `showSubtotals` prop

**Estoque table styling:**
- Content-sized (`w-fit`) and centered horizontally via flex container
- Vertical grid lines on all data cells (`border-r border-zinc-100`)
- Horizontal grid lines on all data rows (`border-b border-zinc-100`)
- Rounded corners (`rounded-xl`) with `overflow-hidden` on the card
- Empty stock values ("0 un.") display in light red (`text-red-400`)
- Delete buttons ("×") display in light red (`text-red-400`) with hover states

**Subtotals toggle:**
Navbar toggle switch (beside Sync button) controls per-product subtotal row visibility:
- When **enabled** (default): each product group shows a "Subtotal" row before the next product
- When **disabled**: only the global "Total" row appears
- Toggle state is managed in `CatalogShell`, passed to `CatalogView` as `showSubtotals` prop

`lib/supabase.ts` uses a lazy singleton (`getSupabase()`) to avoid instantiating the client at build time.
