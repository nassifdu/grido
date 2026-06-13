import { cookies } from "next/headers";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";

function parseSessionPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch {
    return null;
  }
}

export const metadata = { title: "Dashboard · Grido" };

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;
  const payload = sessionToken ? parseSessionPayload(sessionToken) : null;

  const blingUserId = payload?.sub as string | undefined;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-zinc-50">
      <DashboardHeader blingUserId={blingUserId} />

      {/* Main content */}
      <main className="flex-1 overflow-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-1">Dashboard</h1>
          <p className="text-sm text-zinc-500 mb-8">Escolha uma área para começar.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Catálogo widget */}
            <a
              href="/dashboard/catalog"
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm hover:shadow-md hover:border-zinc-300 transition-all"
            >
              {/* Placeholder photo */}
              <div className="h-44 w-full bg-gradient-to-br from-zinc-800 to-zinc-600 flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)",
                    backgroundSize: "12px 12px",
                  }}
                />
                <svg
                  className="h-20 w-20 text-white/20"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={0.75}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
                </svg>
              </div>

              {/* Card body */}
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 group-hover:bg-zinc-200 transition-colors">
                  <svg
                    className="h-5 w-5 text-zinc-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Estoque</p>
                  <p className="text-xs text-zinc-500">Grade analítica dinâmica</p>
                </div>
                <svg
                  className="ml-auto h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </a>

            {/* Inconsistências widget */}
            <a
              href="/dashboard/inconsistencies"
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm hover:shadow-md hover:border-zinc-300 transition-all"
            >
              {/* Placeholder photo */}
              <div className="h-44 w-full bg-gradient-to-br from-amber-700 to-orange-500 flex items-center justify-center overflow-hidden">
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(-45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)",
                    backgroundSize: "12px 12px",
                  }}
                />
                <svg
                  className="h-20 w-20 text-white/20"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={0.75}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>

              {/* Card body */}
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 group-hover:bg-amber-100 transition-colors">
                  <svg
                    className="h-5 w-5 text-amber-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Inconsistências</p>
                  <p className="text-xs text-zinc-500">Análise automática de padrões</p>
                </div>
                <svg
                  className="ml-auto h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
