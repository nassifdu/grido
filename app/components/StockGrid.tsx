"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { SIZES, Size, StockRow } from "@/app/lib/pivot/types";

const columnHelper = createColumnHelper<StockRow>();

const columns = [
  columnHelper.accessor("categoria", {
    header: "Categoria",
    cell: (info) => <span className="text-zinc-600">{info.getValue()}</span>,
  }),
  columnHelper.accessor("referencia", {
    header: "SKU",
    cell: (info) => (
      <span className="font-mono text-xs text-zinc-700">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("descricao", {
    header: "Descrição",
    cell: (info) => <span className="text-zinc-800">{info.getValue()}</span>,
  }),
  columnHelper.accessor("cor", {
    header: "Cor",
    cell: (info) => <span className="text-zinc-800">{info.getValue()}</span>,
  }),
  ...SIZES.map((size) =>
    columnHelper.accessor((row) => row.estoque[size as Size], {
      id: size,
      header: size,
      cell: (info) => {
        const val = info.getValue();
        return (
          <span
            className={
              val === 0
                ? "text-zinc-400"
                : val <= 3
                  ? "font-medium text-amber-600"
                  : "text-zinc-800"
            }
          >
            {val}
          </span>
        );
      },
    })
  ),
  columnHelper.display({
    id: "total",
    header: "Total",
    cell: ({ row }) => {
      const total = SIZES.reduce(
        (sum, s) => sum + row.original.estoque[s],
        0
      );
      return <span className="font-semibold text-zinc-900">{total}</span>;
    },
  }),
];

export default function StockGrid({ data }: { data: StockRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    autoResetAll: false,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="w-full text-sm text-left">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:text-zinc-800"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <span className="flex items-center gap-1">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {{
                      asc: " ↑",
                      desc: " ↓",
                    }[header.column.getIsSorted() as string] ?? ""}
                  </span>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-zinc-50 transition-colors">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
