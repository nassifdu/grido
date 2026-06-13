# DESIGN.md

This document describes the design philosophy, visual systems, and UX patterns that drive **Grido**.

---

## Design Philosophy

**Grido** is a data-first interface for fashion inventory analysis. The core mission is to make complex, multi-dimensional stock data (product × color × size) **scannable, comparable, and actionable**.

Key principles:

- **Clarity over decoration** — Minimal visual noise; every element serves a purpose. Subtle grid backgrounds and monochromatic palettes let data be the focus.
- **Density where it matters** — Compact tables maximize data visibility without overwhelming the eye. Generous spacing in search and controls reduces cognitive load.
- **Mode flexibility** — Support multiple views (grouped by product, flat all-colors, with/without subtotals) because different tasks need different perspectives.
- **Work alongside, not interrupt** — Cell annotations (incoming stock, to-buy flags) live *on* the grid, not in modals. Inline editing keeps context.
- **Progressive disclosure** — Basic controls are always visible (search, sync status); advanced toggles (view mode, price column) are grouped into familiar button sets.

---

## Visual Design System

### Color Palette

**Neutral baseline: Zinc monochrome**  
All backgrounds, text, borders, and structure use zinc (0–900). This creates visual consistency and lets semantic colors (red, green, blue, amber) stand out.

| Zinc Usage | Intent |
|---|---|
| `text-zinc-900` | Primary text, headers, product names |
| `text-zinc-700` | Subtext, secondary labels, cell values |
| `text-zinc-400` | Tertiary text, placeholders, timestamps |
| `bg-zinc-50` | Subtle background fills (controls, sections) |
| `bg-zinc-100` | Medium background (button groups, toggles) |
| `border-zinc-200` | Card and section dividers |

**Semantic colors:**

| Color | Meaning | Usage |
|---|---|---|
| **Green (`emerald-700`)** | Healthy stock (≥10 units) | Cell values with good inventory |
| **Red (`red-400`)** | Zero/low stock or destructive action | Empty cells ("0 un."), delete buttons (×) |
| **Blue (`blue-500`)** | Incoming/receiving signal | Download icon for "incoming stock" annotations |
| **Amber (`amber-500`)** | To-buy/purchase intent | Dollar-sign circle for "to-buy" annotations |

The color scheme balances practical information density (green for plenty, red for warnings) with actionable metadata (blue/amber for planning).

### Typography

- **Font stack:** System defaults (SF Pro, Segoe UI, Roboto) ensure fast load and platform consistency
- **Font sizes:** Consistent scale from `text-xs` (timestamps) to `text-6xl` (homepage hero)
- **Font weights:** Bold for headers and values; regular for prose; monospace (`tabular-nums`) for numbers in tables
- **Letter spacing:** Tight on headers (tracking-tight), loose on uppercase labels (tracking-wider)

### Spacing & Layout

- **Compact rhythm:** `px-3 py-2.5` for table cells, `px-6 py-8` for page margins. Respects dense data without claustrophobic feel.
- **Gap scale:** `gap-2`, `gap-3`, `gap-6` for consistent breathing room between sections
- **Border radius:** `rounded-lg` (8px) for buttons/inputs; `rounded-2xl` (16px) for cards; `rounded-xl` (12px) for table wrapper
- **Responsive:** Sidebar collapses gracefully; grid layout switches from 2-col to 1-col on smaller screens

### Components

**Button styles:**

- **Primary buttons** (CTA, "Conectar Bling"): Dark background (`bg-zinc-900`), white text, shadow, subtle lift on hover
- **Secondary buttons** ("Sair", "Limpar"): Border outline, zinc text, hover to light background
- **Toggle buttons** (view mode, filters): Grouped with rounded container; active state has white background + shadow; inactive states are lighter
- **Icon buttons** (star, annotations): No background by default; hover reveals background for discoverability

**Input styles:**

- **Text inputs** (search, filters): `bg-zinc-50` border, focus to white with ring, smooth transitions
- **Sliders** (mínimo filter): Accent color matches primary brand (zinc-700)
- **Annotation input** (overlay): Minimal border, focus ring matches annotation type (blue or amber)

**Cards & containers:**

- **Dashboard widgets:** Rounded border, subtle shadow, gradient hero area (with repeating-linear-gradient for texture), icon + text footer
- **Table wrapper:** `rounded-xl` with `overflow-hidden`, `border`, subtle shadow, white background
- **Sidebar:** Tall flex column, border-right divider, scrollable results area

---

## UX Patterns

### Search & Discovery Flow

1. **Empty state** — Sidebar prompts "Busque um produto para começar" (Search to begin)
2. **Three-part filter** — Main search box + color + size filters, all debounced 280ms to avoid API spam
3. **Result list** — Compact checkboxes; metadata (total units, color count, variant count) helps distinguish similar products
4. **Select all** — "Tudo" button batch-loads up to 3 products in parallel (limited concurrency to avoid server overload)

**Rationale:** Fashion inventory is messy (variants, colors, sizes overlap). Three search dimensions (name, color, size) handle most user intents without forcing sequential drilling.

### Pivot Grid: Grouped View

**Structure:** Each selected product becomes a "group" with:
1. Product header (product name, total units, delete button)
2. Color rows (one per unique color)
3. Size columns (dynamically computed union of all sizes across all products)
4. Subtotal row (optional toggle)

**Rationale:** Grouping by product keeps related inventory together, making it easy to see product-level totals and compare color distribution *within* that product.

**Example:**

```
Camiseta Básica — 45 un. [×]
  Preto     2  4  6  8  | 20 un.
  Branco    1  2  3  4  | 10 un.
  Vermelho  3  3  4  5  | 15 un.
  Subtotal  6  9 13 17  | 45 un.
```

### Pivot Grid: Flat View

**Structure:** Collapse product groups; each row is a unique (product, color) pair with a product code + color label. Delete button only appears on first row of each product to save space.

**Rationale:** Flat view trades grouped context for raw spreadsheet-like scannability. Useful when comparing one specific color across multiple products (e.g., "Which products have blue in stock?").

### Cell Annotations: Inline "incoming" & "to-buy"

Each stock cell can carry two optional annotations:

- **Incoming** (blue ↓): "5 units arriving on Thursday"
- **To-buy** (amber $): "3 units need to be ordered"

**Visual placement:**
- Incoming appears **top-right** with down-arrow icon
- To-buy appears **bottom-right** with dollar-sign icon
- Both are small (`text-[10px]`) and bold, appearing only when set

**Interaction:**
- Hover over a cell → icons fade in (opacity 0→100 on group:hover)
- Click icon → inline number input replaces cell value
- Enter or blur → saves annotation; Escape cancels
- Click annotation value → edit again

**Rationale:** Annotations live on the grid because planning decisions (stock arrival, purchasing) are most relevant *next to* current inventory. Inline editing avoids context-switching to a separate form.

### Starring Cells

Top-left corner of each cell has a star icon that:
- Fills with amber when clicked (emphasized)
- Fades on hover, visible when starred
- Highlights cell background with `bg-amber-50`

**Rationale:** Managers can mark critical low-stock situations or high-priority reorders for quick visual scanning.

### Toggle Buttons: Subtotals | Zeros | Price

**Subtotals** — Show/hide per-product totals (grouped view only)
- Default: on (managers want to see product subtotals)
- Off: cleaner for flat view or when only global total matters

**Zeros** — Show/hide cells with 0 inventory
- When on: displays "0" in red for explicit zero visibility
- When off: replaces zeros with faint centered dot (·) to reduce visual clutter

**Price** — Show/hide price column (varies by Bling data availability)
- When available, displays as "R$" with prices per color/row

**View Mode** — Toggle between "Agrupada" (grouped) and "Plana" (flat)

---

## Data Visualization Details

### Size Ordering

Sizes are ordered intelligently depending on type:

- **All numeric** (e.g., 2, 4, 6, 8, 10): Sort numerically (not lexicographic)
- **All letter** (PP, P, M, G, GG, ...): Use fashion-standard sequence:
  - Brazilian sizes: RN, PP, P, M, G, GG, GGG, XGG, XG
  - International: EG, EGG, XS, S, L, XL, XXL, XXXL
  - Unknowns fall to the end, sorted alphabetically

**Rationale:** Fashion inventory spans both numeric (european) and letter (brazilian) sizing. Consistent ordering prevents cognitive load when scanning across products with mixed size types.

### Totals

Three total levels:

| Level | Scope | Where |
|---|---|---|
| **Row total** | Sum of sizes for one color | Last cell in each row |
| **Subtotal** | Sum of all rows for one product | Optional bottom row per product |
| **Grand total** | Sum across all selected products | Table footer |

All totals use `font-bold` to distinguish from cell values.

### Cell Styling

- **Zero stock** (`val === 0`): Red text (`text-red-400`) or dot (·) depending on Zeros toggle
- **Good stock** (`val >= 10`): Green bold (`text-emerald-700 font-medium`)
- **Low stock** (`1–9`): Default gray (`text-zinc-700`)
- **Hover state:** `bg-zinc-50/70` on rows, allowing annotations to overlay

---

## Layout & Navigation

### Hierarchical Screens

1. **Landing page** (`/`) — Typewriter slogan, Bling OAuth button, subtle grid background
2. **Dashboard** (`/dashboard`) — Widget grid: "Estoque" (active), "Inconsistências" (disabled/coming)
3. **Catalog view** (`/dashboard/catalog`) — Full screen: sidebar + main table

### Sidebar (Catalog View)

Persistent left column with:
- Search input + live spinner
- Color + size filters
- Mínimo (minimum stock) slider with monospace label + current value
- Results list with product names, totals, metadata
- Footer: selection counter + "Tudo" (select all) button

**Rationale:** Sidebar keeps search controls always visible while table scrolls independently.

### Header

- **Landing header:** Clean, minimal; just Grido logo
- **Catalog header:** Brand name + breadcrumb nav (Dashboard | Estoque), sync status badge, Logout button

**Sync status badge** (from `SyncLastTime`):
- Syncing: spinning icon + "Sincronizando…"
- Idle: sync icon + "Última sincronização: X min atrás"
- Fetches status every 60s; detects stale syncs (>10 min old) and stops showing "syncing"

### Controls Bar

Below the header, above the main table. Contains:

- **View mode toggle:** Agrupada (grouped) | Plana (flat), styled as button-pair
- **Options toggles:** Subtotais | Zeros | Preço, grouped into a separate button-pair container
- **Clear button:** Limpar (delete all selections), floated right

**Rationale:** Grouping by functional area (view, filters) lets eyes quickly find the control needed without reading every button.

---

## Responsive & Mobile Considerations

- **Sidebar width:** Fixed 18rem (288px); remains on desktop
- **Table wrapper:** `w-fit` (content-sized), centered via `mx-auto` so users scroll horizontally if needed
- **Dashboard widgets:** `grid-cols-1 sm:grid-cols-2` for single-column on mobile
- **Buttons:** Consistent padding across breakpoints; icons scale to visible sizes even at small viewports

---

## Interaction & Micro-Interactions

### Transitions

- **Color changes:** `transition-colors` (hover states, toggles)
- **All states:** `duration-200` for snappy feel (not slow, not jarring)
- **Button hovers:** Subtle lift (`-translate-y-0.5`) + shadow intensification for CTA buttons

### Loading States

- **Spinner:** Animated SVG with opacity fading (opacity-25 + opacity-75 for visual depth)
- **Search:** Right side icon spinner when fetching results
- **Product loading:** Spinner appears in table cell while data loads
- **Disabled state:** Opacity-60 with `cursor-not-allowed` (e.g., "Inconsistências" widget)

### Feedback

- **Annotation input:** Border color matches annotation type (blue or amber) to confirm intent
- **Starred cells:** Background highlight (`bg-amber-50`) provides visual confirmation
- **Selected products:** Checkbox fills on selection; hover highlight shows hover state

---

## Typography & Microcopy

**Portuguese language** — All UI text is in Brazilian Portuguese (Grido, Estoque, Sincronizar, etc.).

**Microcopy tone:**
- Friendly but clear: "Busque um produto para começar" (Search to begin)
- Action-oriented: "Conectar Bling" (Connect Bling, not "Login")
- Concise labels: "Mínimo", "Tudo", "Limpar" (minimum, all, clear)

---

## Future Extensions (Not Yet Designed)

- **Inconsistências widget** — Planned; currently a disabled placeholder (amber-themed) to hint at future parity dashboard
- **Multi-user collaboration** — Notes, lock states, real-time sync (future; currently single-user)
- **Mobile app** — Current design assumes laptop/desktop workflow; touch interactions would need refinement
- **Dark mode** — Zinc monochrome is light-biased; dark mode CSS would be added to `.dark` root class if requested

---

## Summary

Grido's design balances **data density** with **visual clarity** through a restrained monochromatic palette, strategic use of semantic color, and inline interaction patterns that prioritize context preservation. The pivot grid layout, flexible view modes, and cell-level annotations enable fashion inventory managers to quickly scan, compare, and act on complex multi-dimensional stock data without leaving the grid.
