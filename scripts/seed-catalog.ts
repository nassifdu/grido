/**
 * One-time seed: uploads local data/produtos.json and data/variacoes.json to Supabase.
 * Run with: npx tsx scripts/seed-catalog.ts
 */
import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
const envContent = await fs.readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=][^=]*)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"(.*)"$/, "$1");
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH = 500;

async function upsertBatch(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`[${table}] batch at ${i}: ${error.message}`);
    process.stdout.write(`\r  ${table}: ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log();
}

// ── Produtos ──────────────────────────────────────────────────────────────────
console.log("Seeding bling_produtos…");
const rawProdutos = JSON.parse(
  await fs.readFile(path.join(process.cwd(), "data", "produtos.json"), "utf-8")
);
const productsList: { id: number }[] = Array.isArray(rawProdutos)
  ? rawProdutos
  : rawProdutos.products ?? [];

const prodRows = productsList.map((p) => ({
  id: p.id,
  data: p,
  synced_at: new Date().toISOString(),
}));
await upsertBatch("bling_produtos", prodRows);
console.log(`  Done: ${prodRows.length} products\n`);

// ── Variacoes ─────────────────────────────────────────────────────────────────
console.log("Seeding bling_variacoes…");
const rawVariacoes: Record<string, { id: number }[]> = JSON.parse(
  await fs.readFile(path.join(process.cwd(), "data", "variacoes.json"), "utf-8")
);

const varRows: Record<string, unknown>[] = [];
for (const [parentIdStr, children] of Object.entries(rawVariacoes)) {
  const id_produto_pai = parseInt(parentIdStr);
  for (const child of children) {
    varRows.push({
      id: child.id,
      id_produto_pai,
      data: child,
      synced_at: new Date().toISOString(),
    });
  }
}
await upsertBatch("bling_variacoes", varRows);
console.log(`  Done: ${varRows.length} variations\n`);

console.log("Seed complete.");
