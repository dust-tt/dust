"use client";

import Link from "next/link";
import { useState } from "react";
import type { ComponentUsage } from "@/lib/types";

const PAGE_SIZE = 5;

export function LeastUsedTable({ entries }: { entries: ComponentUsage[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const slice = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (entries.length === 0) {
    return <p className="text-xs text-gray-400">No components found.</p>;
  }

  return (
    <div>
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <th className="text-left pb-2 text-xs text-gray-300 uppercase tracking-widest">Component</th>
            <th className="text-right pb-2 text-xs text-gray-300 uppercase tracking-widest">Usages</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((c) => (
            <tr key={c.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td className="py-4 text-sm">
                <Link
                  href={`/components/${encodeURIComponent(c.name)}`}
                  className="underline underline-offset-2 decoration-1 hover:opacity-70 transition-opacity"
                  style={{ color: "#00d992" }}
                >
                  {c.name}
                </Link>
              </td>
              <td className="py-4 text-right text-sm text-gray-400 tabular-nums">
                {c.usageCount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 text-sm text-gray-400">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="hover:text-gray-50 disabled:opacity-30 transition-colors px-1"
          >
            ‹
          </button>
          <span>{page + 1} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="hover:text-gray-50 disabled:opacity-30 transition-colors px-1"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
