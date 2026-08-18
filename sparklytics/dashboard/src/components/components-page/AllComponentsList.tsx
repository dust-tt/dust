"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ComponentUsage } from "@/lib/types";

interface AllComponentsListProps {
  sparkleComponents: ComponentUsage[];
  customComponents: ComponentUsage[];
}

type SourceFilter = "all" | "sparkle" | "external" | "local";

function SourceBadge({ importedFrom }: { importedFrom: string }) {
  if (importedFrom === "@dust-tt/sparkle") {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded font-medium shrink-0"
        style={{
          background: "rgba(0, 217, 146, 0.1)",
          border: "1px solid rgba(0, 217, 146, 0.3)",
          color: "#00d992",
        }}
      >
        Sparkle
      </span>
    );
  }
  if (importedFrom === "local") {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded font-medium shrink-0"
        style={{
          background: "rgba(255, 186, 0, 0.1)",
          border: "1px solid rgba(255, 186, 0, 0.3)",
          color: "#ffba00",
        }}
      >
        local
      </span>
    );
  }
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-medium shrink-0"
      style={{
        background: "rgba(129, 140, 248, 0.1)",
        border: "1px solid rgba(129, 140, 248, 0.3)",
        color: "#818cf8",
      }}
    >
      external
    </span>
  );
}

export function AllComponentsList({
  sparkleComponents,
  customComponents,
}: AllComponentsListProps) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const all = useMemo(
    () =>
      [...sparkleComponents, ...customComponents].sort(
        (a, b) => b.usageCount - a.usageCount
      ),
    [sparkleComponents, customComponents]
  );

  const filtered = useMemo(() => {
    let result = all;
    if (sourceFilter === "sparkle")
      result = result.filter((c) => c.importedFrom === "@dust-tt/sparkle");
    else if (sourceFilter === "external")
      result = result.filter(
        (c) => c.importedFrom !== "local" && c.importedFrom !== "@dust-tt/sparkle"
      );
    else if (sourceFilter === "local")
      result = result.filter((c) => c.importedFrom === "local");
    if (search)
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.importedFrom.toLowerCase().includes(search.toLowerCase())
      );
    return result;
  }, [all, sourceFilter, search]);

  const FILTERS: { key: SourceFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "sparkle", label: "Sparkle" },
    { key: "external", label: "External" },
    { key: "local", label: "Local" },
  ];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search components or package…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none w-64"
          style={{ background: "#050507", border: "1px solid #3d3a39" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(0,217,146,0.5)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#3d3a39"; }}
        />
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setSourceFilter(f.key)}
              className="px-3 py-1.5 text-xs rounded transition-colors"
              style={
                sourceFilter === f.key
                  ? { background: "#1a1a1a", border: "1px solid #3d3a39", color: "#f2f2f2" }
                  : { color: "#8b949e" }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto tabular-nums">
          {filtered.length} components
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #3d3a39" }}>

        {/* Column header */}
        <div
          className="flex items-center px-4 py-2 gap-4"
          style={{ background: "#1a1a1a", borderBottom: "1px solid #3d3a39" }}
        >
          <span className="flex-1 text-xs text-gray-300 uppercase tracking-widest">Component</span>
          <span className="w-20 text-right text-xs text-gray-300 uppercase tracking-widest">Usages</span>
          <span className="w-16 text-right text-xs text-gray-300 uppercase tracking-widest">Props</span>
          <span className="w-16 text-right text-xs text-gray-300 uppercase tracking-widest">Files</span>
        </div>

        {filtered.map((comp, i) => {
          const fileCount = new Set(comp.locations.map((l) => l.filePath)).size;
          const topFile = comp.locations[0]?.filePath;
          const isSparkle = comp.importedFrom === "@dust-tt/sparkle";

          return (
            <div
              key={`${comp.importedFrom}::${comp.name}`}
              className="flex items-center gap-4 px-4 py-3 hover:bg-gray-850 transition-colors"
              style={{
                background: i % 2 === 0 ? "#101010" : "#0d0d0d",
                borderBottom: i < filtered.length - 1 ? "1px solid #3d3a39" : undefined,
              }}
            >
              {/* Main cell — name, package, badges, file path */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <Link
                    href={`/components/${encodeURIComponent(comp.name)}`}
                    className="font-semibold underline underline-offset-2 decoration-1 hover:opacity-70 transition-opacity"
                    style={{ color: isSparkle ? "#00d992" : "#60a5fa" }}
                  >
                    {comp.name}
                  </Link>
                  <span className="text-xs font-mono text-gray-500 truncate">{comp.importedFrom}</span>
                </div>
                <div className="flex items-center gap-2">
                  <SourceBadge importedFrom={comp.importedFrom} />
                  {topFile && (
                    <span className="text-xs font-mono text-gray-600 truncate max-w-xs">
                      {topFile}
                    </span>
                  )}
                </div>
              </div>

              {/* Usages column */}
              <span className="w-20 text-right text-sm font-mono tabular-nums text-gray-300">
                {comp.usageCount.toLocaleString()}
              </span>

              {/* Props column */}
              <span className="w-16 text-right text-sm font-mono tabular-nums text-gray-400">
                {comp.props.length}
              </span>

              {/* Files column (⁂ = distinct parent files) */}
              <span className="w-16 text-right text-sm font-mono tabular-nums" style={{ color: "#ffba00" }}>
                {fileCount}
              </span>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-gray-500 text-sm">
            No components match your filter.
          </div>
        )}
      </div>
    </div>
  );
}
