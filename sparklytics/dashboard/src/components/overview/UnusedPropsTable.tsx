"use client";

import Link from "next/link";
import { useState } from "react";
import type { UnusedPropEntry } from "@/lib/metrics";

const PAGE_SIZE = 5;

export function UnusedPropsTable({ entries }: { entries: UnusedPropEntry[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const slice = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (entries.length === 0) {
    return <p className="text-xs text-gray-400">No underused props detected.</p>;
  }

  return (
    <div>
      <table className="w-full table-fixed">
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <th className="text-left pb-2 text-xs text-gray-300 uppercase tracking-widest w-[40%]">Prop</th>
            <th className="text-left pb-2 text-xs text-gray-300 uppercase tracking-widest w-[45%]">Component</th>
            <th className="text-right pb-2 text-xs text-gray-300 uppercase tracking-widest w-[15%]">Usages</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((e, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td className="py-4 font-mono text-sm text-gray-50 truncate">{e.propName}</td>
              <td className="py-4 text-sm truncate">
                <Link
                  href={`/components/${encodeURIComponent(e.componentName)}`}
                  className="underline underline-offset-2 decoration-1 hover:opacity-70 transition-opacity"
                  style={{ color: e.importedFrom === "@dust-tt/sparkle" ? "#00d992" : "#60a5fa" }}
                >
                  {e.componentName}
                </Link>
                {e.importedFrom && (
                  <span className="text-gray-400 text-xs ml-2 truncate">{e.importedFrom}</span>
                )}
              </td>
              <td className="py-4 text-right text-sm text-gray-400 tabular-nums">
                {e.propUsageCount} of {e.componentUsageCount}
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
