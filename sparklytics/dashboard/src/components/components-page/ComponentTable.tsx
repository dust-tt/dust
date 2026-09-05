"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ComponentUsage } from "@/lib/types";

interface ComponentTableProps {
  components: ComponentUsage[];
}

type SortKey = "name" | "usageCount" | "defaultUsageCount";

export function ComponentTable({ components }: ComponentTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("usageCount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<"all" | "used" | "unused">("all");

  const filtered = useMemo(() => {
    let result = components;
    if (filter === "used") result = result.filter((c) => c.usageCount > 0);
    if (filter === "unused") result = result.filter((c) => c.usageCount === 0);
    if (search) {
      result = result.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      );
    }
    return [...result].sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? Number(aVal) - Number(bVal)
        : Number(bVal) - Number(aVal);
    });
  }, [components, search, sortKey, sortDir, filter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : "↕";

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search components..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-400 focus:outline-none w-56"
          style={{
            background: "#07080a",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(85,179,255,0.4)";
            e.currentTarget.style.boxShadow = "rgba(85,179,255,0.12) 0px 0px 0px 3px";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <div className="flex gap-1">
          {(["all", "used", "unused"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-md capitalize transition-opacity ${
                filter === f
                  ? "bg-gray-800 text-gray-50"
                  : "text-gray-300 hover:text-gray-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 self-center ml-auto tabular-nums">
          {filtered.length} components
        </span>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid #3d3a39",
          boxShadow: "rgba(92, 88, 85, 0.2) 0px 0px 15px",
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              className="bg-gray-900"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <th
                className="text-left px-4 py-3 text-xs text-gray-300 uppercase tracking-widest cursor-pointer hover:text-gray-50 transition-colors"
                onClick={() => toggleSort("name")}
              >
                Component <SortIcon col="name" />
              </th>
              <th
                className="text-right px-4 py-3 text-xs text-gray-300 uppercase tracking-widest cursor-pointer hover:text-gray-50 transition-colors"
                onClick={() => toggleSort("usageCount")}
              >
                Usages <SortIcon col="usageCount" />
              </th>
              <th className="text-right px-4 py-3 text-xs text-gray-300 uppercase tracking-widest">
                Files
              </th>
              <th className="text-right px-4 py-3 text-xs text-gray-300 uppercase tracking-widest">
                Props
              </th>
              <th className="text-right px-4 py-3 text-xs text-gray-300 uppercase tracking-widest">
                Default %
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((comp) => {
              const fileCount = new Set(comp.locations.map((l) => l.filePath)).size;
              const defaultPct =
                comp.usageCount > 0
                  ? Math.round((comp.defaultUsageCount / comp.usageCount) * 100)
                  : 0;
              return (
                <tr
                  key={comp.name}
                  className="bg-gray-900/50 hover:bg-gray-800/40 transition-colors"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/components/${encodeURIComponent(comp.name)}`}
                      className="font-mono text-blue-400 underline underline-offset-2 decoration-1 hover:opacity-70 transition-opacity"
                    >
                      {comp.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-200 font-mono tabular-nums">
                    {comp.usageCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{fileCount}</td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{comp.props.length}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={defaultPct > 50 ? "text-amber-400" : "text-gray-400"}>
                      {defaultPct}%
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No components match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
