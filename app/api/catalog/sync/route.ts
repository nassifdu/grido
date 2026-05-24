import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { blingFetch } from "@/lib/bling";
import { getSupabase } from "@/lib/supabase";
import { clearTransformCache } from "@/lib/transform";

const PRODUTOS_PAGE = 100;
const UPSERT_BATCH = 500;
const DELAY_MS = 400; // stay under Bling's 3 req/sec limit

const enc = new TextEncoder();

function sse(payload: unknown): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: NextRequest) {
  const blingUserId = await getSession(request);
  if (!blingUserId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    try {
      // ── Step 1: fetch all products ─────────────────────────────────────────
      await writer.write(sse({ type: "log", message: "Buscando produtos do Bling…" }));

      const allProducts: Record<string, unknown>[] = [];
      let pagina = 1;

      while (true) {
        const res = await blingFetch(
          blingUserId,
          `/produtos?limite=${PRODUTOS_PAGE}&pagina=${pagina}&situacao=A`
        );
        if (!res.ok) throw new Error(`Bling products: HTTP ${res.status}`);

        const { data } = await res.json();
        const items: Record<string, unknown>[] = Array.isArray(data) ? data : [];
        allProducts.push(...items);

        await writer.write(
          sse({ type: "progress", step: "produtos", count: allProducts.length })
        );

        if (items.length < PRODUTOS_PAGE) break;
        pagina++;
        await delay(334); // ~3 req/sec
      }

      // ── Step 2: upsert products to Supabase ───────────────────────────────
      await writer.write(
        sse({ type: "log", message: `Salvando ${allProducts.length} produtos…` })
      );

      const now = new Date().toISOString();
      for (let i = 0; i < allProducts.length; i += UPSERT_BATCH) {
        const batch = allProducts.slice(i, i + UPSERT_BATCH).map((p) => ({
          id: p.id,
          data: p,
          synced_at: now,
        }));
        const { error } = await getSupabase()
          .from("bling_produtos")
          .upsert(batch, { onConflict: "id" });
        if (error) throw new Error(`Supabase produtos upsert: ${error.message}`);
      }

      // ── Step 3: collect parent IDs ────────────────────────────────────────
      const parentIds = [
        ...new Set(
          allProducts
            .map((p) => p.idProdutoPai as number | undefined)
            .filter((id): id is number => id != null)
        ),
      ];

      await writer.write(
        sse({
          type: "log",
          message: `Buscando variações (${parentIds.length} produtos pai)…`,
        })
      );

      // ── Step 4: fetch & upsert variations ─────────────────────────────────
      const pendingVars: Record<string, unknown>[] = [];

      for (let i = 0; i < parentIds.length; i++) {
        const parentId = parentIds[i];

        try {
          const res = await blingFetch(blingUserId, `/produtos/variacoes/${parentId}`);
          if (res.ok) {
            const { data } = await res.json();
            const variations: Record<string, unknown>[] = Array.isArray(data?.variacoes)
              ? data.variacoes
              : [];

            for (const v of variations) {
              pendingVars.push({
                id: v.id,
                id_produto_pai: parentId,
                data: v,
                synced_at: now,
              });
            }
          }
        } catch {
          // skip failed parents — log but continue
          console.error(`[sync] variation fetch failed for parent ${parentId}`);
        }

        // flush accumulated variations every 200
        if (pendingVars.length >= 200) {
          const { error } = await getSupabase()
            .from("bling_variacoes")
            .upsert([...pendingVars], { onConflict: "id" });
          if (error) throw new Error(`Supabase variacoes upsert: ${error.message}`);
          pendingVars.length = 0;
        }

        await writer.write(
          sse({ type: "progress", step: "variacoes", current: i + 1, total: parentIds.length })
        );

        if (i < parentIds.length - 1) await delay(DELAY_MS);
      }

      // flush remaining variations
      if (pendingVars.length > 0) {
        const { error } = await getSupabase()
          .from("bling_variacoes")
          .upsert([...pendingVars], { onConflict: "id" });
        if (error) throw new Error(`Supabase variacoes upsert (final): ${error.message}`);
      }

      clearTransformCache();
      await writer.write(sse({ type: "done" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      try {
        await writer.write(sse({ type: "error", message }));
      } catch {
        // stream already closed
      }
    } finally {
      try {
        await writer.close();
      } catch {
        // already closed
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
