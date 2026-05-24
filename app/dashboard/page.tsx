import { cookies } from "next/headers";

function parseSessionPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;
  const payload = sessionToken ? parseSessionPayload(sessionToken) : null;

  const blingUserId = payload?.sub as string | undefined;
  const expiresAt = payload?.exp
    ? new Date((payload.exp as number) * 1000).toLocaleString("pt-BR")
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Grido</h1>
          <p className="mt-1 text-sm text-zinc-500">Dashboard</p>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="mt-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            Sair
          </button>
        </form>
      </header>

      <div className="mb-6 flex gap-3">
        <a
          href="/dashboard/catalog"
          className="rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm hover:border-zinc-300 hover:shadow transition-all group flex items-center gap-3"
        >
          <svg className="h-5 w-5 text-zinc-400 group-hover:text-zinc-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-zinc-800">Catálogo</p>
            <p className="text-xs text-zinc-400">Grade analítica de estoque</p>
          </div>
        </a>
      </div>

      <main className="max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-zinc-800">Sessão ativa</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Conta Bling</dt>
            <dd className="font-mono text-zinc-900">{blingUserId ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Sessão expira em</dt>
            <dd className="text-zinc-900">{expiresAt ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Status</dt>
            <dd className="font-medium text-emerald-600">Autenticado</dd>
          </div>
        </dl>
      </main>
    </div>
  );
}
