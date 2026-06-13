"use client";

import { useEffect, useRef, useState } from "react";

interface ProductRef {
  id: number;
  nome: string;
  cor: string | null;
  variacao_nome: string | null;
}

interface InconsistencyPattern {
  label: string;
  count: number;
  products: ProductRef[];
}

interface InconsistencySection {
  id: string;
  title: string;
  description: string;
  color: "red" | "amber" | "blue";
  patterns: InconsistencyPattern[];
}

const COLORS = {
  red: {
    badge: "bg-red-100 text-red-700",
    selected: "border-red-300 bg-red-50",
    header: "text-red-600",
    icon: "text-red-400",
  },
  amber: {
    badge: "bg-amber-100 text-amber-700",
    selected: "border-amber-300 bg-amber-50",
    header: "text-amber-600",
    icon: "text-amber-400",
  },
  blue: {
    badge: "bg-blue-100 text-blue-700",
    selected: "border-blue-300 bg-blue-50",
    header: "text-blue-600",
    icon: "text-blue-400",
  },
};

function SectionIcon({ color }: { color: "red" | "amber" | "blue" }) {
  if (color === "red") {
    return (
      <svg className={`h-4 w-4 ${COLORS.red.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    );
  }
  if (color === "amber") {
    return (
      <svg className={`h-4 w-4 ${COLORS.amber.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    );
  }
  return (
    <svg className={`h-4 w-4 ${COLORS.blue.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
    </svg>
  );
}

function PatternCard({
  pattern,
  color,
  selected,
  onClick,
}: {
  pattern: InconsistencyPattern;
  color: "red" | "amber" | "blue";
  selected: boolean;
  onClick: () => void;
}) {
  const c = COLORS[color];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all duration-150 ${
        selected
          ? `${c.selected} shadow-inner`
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
      }`}
    >
      <span className="text-sm font-mono text-zinc-800 leading-none">{pattern.label}</span>
      <span className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${c.badge}`}>
        {pattern.count}
      </span>
    </button>
  );
}

function Modal({
  pattern,
  onClose,
}: {
  pattern: InconsistencyPattern;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        className="w-[90vw] max-w-3xl bg-white rounded-2xl border border-zinc-200 shadow-xl flex flex-col overflow-hidden"
        style={{ maxHeight: "80vh" }}
      >
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between shrink-0">
          <div>
            <span className="text-sm font-semibold font-mono text-zinc-900">{pattern.label}</span>
            <span className="ml-3 text-xs text-zinc-400 tabular-nums">
              {pattern.count} {pattern.count === 1 ? "produto" : "produtos"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto">
          <table className="w-full">
            <tbody>
              {pattern.products.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors">
                  <td className="px-5 py-2.5 font-mono text-xs text-zinc-400 w-24 shrink-0 align-middle">
                    {p.id}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-zinc-800 align-middle">
                    {p.nome}{p.cor ? ` ${p.cor}` : ""}
                  </td>
                  {p.variacao_nome && (
                    <td className="px-5 py-2.5 text-xs text-zinc-400 text-right max-w-xs truncate align-middle hidden sm:table-cell">
                      {p.variacao_nome}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InconsistencySection({
  section,
  activePattern,
  onSelect,
}: {
  section: InconsistencySection;
  activePattern: InconsistencyPattern | null;
  onSelect: (pattern: InconsistencyPattern | null) => void;
}) {
  const c = COLORS[section.color];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2.5">
        <SectionIcon color={section.color} />
        <div>
          <h2 className={`text-sm font-semibold ${c.header}`}>{section.title}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{section.description}</p>
        </div>
        <span className={`ml-auto text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full ${c.badge}`}>
          {section.patterns.length}
        </span>
      </div>
      <div className="px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {section.patterns.map((pattern) => (
            <PatternCard
              key={pattern.label}
              pattern={pattern}
              color={section.color}
              selected={activePattern?.label === pattern.label}
              onClick={() => onSelect(activePattern?.label === pattern.label ? null : pattern)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryBar({ sections }: { sections: InconsistencySection[] }) {
  const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
  const total = (id: string) =>
    byId[id]?.patterns.reduce((sum, p) => sum + p.count, 0) ?? 0;

  const items = [
    { label: "quebrados", value: total("quebrados"), color: "red" },
    { label: "incompletos", value: total("incompletos"), color: "amber" },
    { label: "tamanhos distintos", value: byId["tamanhos"]?.patterns.length ?? 0, color: "blue" },
    { label: "cores distintas", value: byId["cores"]?.patterns.length ?? 0, color: "blue" },
  ].filter((i) => i.value > 0);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 mb-6">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full inline-block ${
              item.color === "red" ? "bg-red-400" : item.color === "amber" ? "bg-amber-400" : "bg-blue-400"
            }`}
          />
          <span className="tabular-nums font-medium text-zinc-700">{item.value}</span>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

export default function InconsistenciesShell() {
  const [sections, setSections] = useState<InconsistencySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePattern, setActivePattern] = useState<InconsistencyPattern | null>(null);

  useEffect(() => {
    fetch("/api/inconsistencies")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSections(data.sections);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-zinc-50">
      <header className="shrink-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur px-6 py-3.5">
        <div className="flex items-center justify-between gap-8">
          <div className="flex items-center gap-5 min-w-0">
            <span className="text-base font-bold tracking-tight text-zinc-900 shrink-0">Grido</span>
            <nav className="flex items-center gap-1 text-sm">
              <a
                href="/dashboard"
                className="rounded-md px-2.5 py-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors"
              >
                Dashboard
              </a>
              <span className="rounded-md px-2.5 py-1.5 font-medium text-zinc-900 bg-zinc-100">
                Inconsistências
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

      <main className="flex-1 overflow-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-1">Inconsistências</h1>
          <p className="text-sm text-zinc-500 mb-8">Padrões detectados automaticamente no catálogo.</p>

          {loading && (
            <div className="flex items-center gap-3 text-sm text-zinc-500 py-12 justify-center">
              <svg className="h-4 w-4 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analisando catálogo…
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              Erro ao carregar: {error}
            </div>
          )}

          {!loading && !error && sections.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm px-6 py-12 text-center">
              <svg className="h-10 w-10 text-zinc-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-zinc-500">Nenhuma inconsistência encontrada.</p>
              <p className="text-xs text-zinc-400 mt-1">O catálogo parece estar em bom estado.</p>
            </div>
          )}

          {!loading && !error && sections.length > 0 && (
            <>
              <SummaryBar sections={sections} />
              <div className="flex flex-col gap-4">
                {sections.map((section) => (
                  <InconsistencySection
                    key={section.id}
                    section={section}
                    activePattern={activePattern}
                    onSelect={setActivePattern}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {activePattern && (
        <Modal pattern={activePattern} onClose={() => setActivePattern(null)} />
      )}
    </div>
  );
}
