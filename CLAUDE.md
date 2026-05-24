# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server on localhost:3000
npm run build    # production build (also type-checks)
npm run start    # serve production build
```

There is no test runner or lint script configured.

## Seed local data into Supabase

After running the SQL migration, upload the existing local JSON snapshot:

```bash
npx tsx scripts/seed-catalog.ts
```

This reads `data/produtos.json` and `data/variacoes.json` and upserts them into `bling_produtos` / `bling_variacoes`. The tables must exist first (run `supabase/migrations/002_catalog_cache.sql`).

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

### API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/login` | GET | Initiate Bling OAuth (PKCE) |
| `/api/auth/callback` | GET | OAuth callback, set session cookie |
| `/api/auth/logout` | POST | Clear session cookie |
| `/api/catalog` | GET | Search products (`?q=&limit=`) |
| `/api/catalog/[parentId]` | GET | Pivot data for a product group |
| `/api/catalog/sync` | POST | SSE stream: fetch Bling → upsert Supabase |
| `/api/bling/sync` | POST | Generic proxy: sync any Bling resource to Supabase |

### Frontend

Pages live in `app/` using the App Router. `app/dashboard/catalog/page.tsx` renders `CatalogView` (client component). The catalog UI lets users search products and pin multiple pivot-table widgets simultaneously. Each widget fetches its pivot data independently after being added.

`lib/supabase.ts` uses a lazy singleton (`getSupabase()`) to avoid instantiating the client at build time.
