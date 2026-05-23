import StockGrid from "@/app/components/StockGrid";
import { mockStock } from "@/app/lib/pivot/mockData";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            Grido
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Grade analítica de moda</p>
        </div>
        <a
          href="/api/auth/login"
          className="mt-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          Conectar Bling
        </a>
      </header>

      <main>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-700">
            Estoque por tamanho
          </h2>
          <span className="text-xs text-zinc-400">
            {mockStock.length} referências · dados simulados
          </span>
        </div>
        <StockGrid data={mockStock} />
      </main>
    </div>
  );
}
