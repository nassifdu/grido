import TypewriterSlogan from "@/app/components/TypewriterSlogan";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white">
      {/* subtle grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative flex flex-col items-center gap-12 text-center px-6">
        {/* Brand */}
        <div>
          <h1 className="text-6xl font-bold tracking-tight text-zinc-900">
            Grido
          </h1>
          <TypewriterSlogan />
        </div>

        {/* CTA */}
        <a
          href="/api/auth/login"
          className="group flex items-center gap-3 rounded-2xl bg-zinc-900 px-8 py-4 text-base font-semibold text-white shadow-xl shadow-zinc-200 transition-all duration-200 hover:bg-zinc-700 hover:shadow-zinc-300 hover:-translate-y-0.5 active:translate-y-0"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-80"
          >
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          Conectar Bling
        </a>

        <p className="text-xs text-zinc-400 -mt-6">
          Faça login com sua conta Bling para continuar
        </p>
      </div>
    </main>
  );
}
