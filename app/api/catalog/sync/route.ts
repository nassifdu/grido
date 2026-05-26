import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { blingFetch } from "@/lib/bling";
import { getSupabase } from "@/lib/supabase";
import { clearTransformCache } from "@/lib/transform";

export const maxDuration = 300; // 300s max on Vercel Pro; raise to 800 on Enterprise

const PRODUTOS_PAGE = 100;
const UPSERT_BATCH = 500;
const CONCURRENCY = 5; // parallel variation fetches per batch (~4.5 req/s)

const enc = new TextEncoder();

function sse(payload: unknown): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function updateSyncStatus(
  blingUserId: string,
  status: string,
  updates: { last_sync_at?: string; sync_started_at?: string; error_message?: string | null }
) {
  const { error } = await getSupabase()
    .from("sync_metadata")
    .upsert(
      { bling_user_id: blingUserId, status, updated_at: new Date().toISOString(), ...updates },
      { onConflict: "bling_user_id" }
    );
  if (error) console.error("Failed to update sync metadata:", error);
}

export async function POST(request: NextRequest) {
  const blingUserId = await getSession(request);
  if (!blingUserId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const syncStartedAt = new Date().toISOString();
  await updateSyncStatus(blingUserId, "syncing", {
    sync_started_at: syncStartedAt,
    error_message: null,
  });

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

      // Mark products as synced immediately — so even a variation-phase timeout
      // leaves a fresh last_sync_at instead of showing the previous sync's time.
      await updateSyncStatus(blingUserId, "syncing", { last_sync_at: now });

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
      let processed = 0;

      // All parent IDs must be fetched from /produtos/variacoes/{parentId} —
      // the /produtos list response lacks the variacao.nome (Cor/Tamanho) attributes.
      for (let i = 0; i < parentIds.length; i += CONCURRENCY) {
        const batch = parentIds.slice(i, i + CONCURRENCY);

        const results = await Promise.allSettled(
          batch.map((parentId) => blingFetch(blingUserId, `/produtos/variacoes/${parentId}`))
        );

        for (let j = 0; j < batch.length; j++) {
          const parentId = batch[j];
          const result = results[j];

          if (result.status === "fulfilled" && result.value.ok) {
            const { data } = await result.value.json();
            const variations: Record<string, unknown>[] = Array.isArray(data?.variacoes)
              ? data.variacoes
              : [];
            for (const v of variations) {
              pendingVars.push({ id: v.id, id_produto_pai: parentId, data: v, synced_at: now });
            }
          } else {
            console.error(`[sync] variation fetch failed for parent ${parentId}`);
          }

          processed++;
          await writer.write(
            sse({ type: "progress", step: "variacoes", current: processed, total: parentIds.length })
          );
        }

        // flush accumulated variations every ~200
        if (pendingVars.length >= 200) {
          const { error } = await getSupabase()
            .from("bling_variacoes")
            .upsert([...pendingVars], { onConflict: "id" });
          if (error) throw new Error(`Supabase variacoes upsert: ${error.message}`);
          pendingVars.length = 0;
        }

        if (i + CONCURRENCY < parentIds.length) await delay(1000);
      }

      // flush remaining variations
      if (pendingVars.length > 0) {
        const { error } = await getSupabase()
          .from("bling_variacoes")
          .upsert([...pendingVars], { onConflict: "id" });
        if (error) throw new Error(`Supabase variacoes upsert (final): ${error.message}`);
      }

      clearTransformCache();
      await updateSyncStatus(blingUserId, "done", { last_sync_at: new Date().toISOString() });
      await writer.write(sse({ type: "done" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      await updateSyncStatus(blingUserId, "error", { error_message: message });
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
