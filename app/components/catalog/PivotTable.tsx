"use client";

import type { ProductPivot } from "@/lib/catalog";

function stockClass(val: number): string {
  if (val === 0) return "text-zinc-300";
  if (val <= 2) return "text-amber-500 font-semibold";
  if (val >= 10) return "text-emerald-700 font-medium";
  return "text-zinc-700";
}

export default function PivotTable({ pivot }: { pivot: ProductPivot }) {
  if (pivot.isChildless) {
    return (
      <div className="flex items-center gap-6 px-6 py-5 text-sm text-zinc-600">
        {pivot.childlessCodigo && (
          <span className="font-mono text-xs text-zinc-400 bg-zinc-50 px-2 py-1 rounded">
            {pivot.childlessCodigo}
          </span>
        )}
        <span>
          Estoque:{" "}
          <span className={`text-base font-bold ${stockClass(pivot.grandTotal)}`}>
            {pivot.grandTotal}
          </span>
        </span>
      </div>
    );
  }

  const { sizes, rows, totals, grandTotal, hasColors } = pivot;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-100">
            {hasColors && (
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap w-40">
                Cor
              </th>
            )}
            {sizes.map((s) => (
              <th
                key={s}
                className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap min-w-[3.5rem]"
              >
                {s}
              </th>
            ))}
            <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-zinc-50/70 transition-colors">
              {hasColors && (
                <td className="px-5 py-2.5 text-sm text-zinc-700 whitespace-nowrap">
                  {row.cor ?? <span className="text-zinc-300 italic text-xs">sem cor</span>}
                </td>
              )}
              {sizes.map((s) => {
                const val = row.cells[s]?.estoque ?? 0;
                return (
                  <td key={s} className="px-3 py-2.5 text-center whitespace-nowrap tabular-nums">
                    <span className={stockClass(val)}>
                      {val === 0 ? <span className="opacity-30">·</span> : val}
                    </span>
                  </td>
                );
              })}
              <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 whitespace-nowrap tabular-nums">
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-zinc-200 bg-zinc-50">
            {hasColors && (
              <td className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Total
              </td>
            )}
            {sizes.map((s) => (
              <td
                key={s}
                className="px-3 py-2.5 text-center text-xs font-semibold text-zinc-500 tabular-nums"
              >
                {totals[s] ?? 0}
              </td>
            ))}
            <td className="px-5 py-2.5 text-center text-sm font-bold text-zinc-900 tabular-nums">
              {grandTotal}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
