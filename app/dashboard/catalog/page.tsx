import CatalogView from "@/app/components/catalog/CatalogView";

export const metadata = { title: "Catálogo · Grido" };

export default function CatalogPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur px-6 py-3.5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-5">
            <span className="text-base font-bold tracking-tight text-zinc-900">Grido</span>
            <nav className="flex items-center gap-1 text-sm">
              <a
                href="/dashboard"
                className="rounded-md px-2.5 py-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors"
              >
                Dashboard
              </a>
              <span className="rounded-md px-2.5 py-1.5 font-medium text-zinc-900 bg-zinc-100">
                Catálogo
              </span>
            </nav>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Grade analítica</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Selecione produtos para visualizar o estoque por cor e tamanho
          </p>
        </div>
        <CatalogView />
      </main>
    </div>
  );
}
