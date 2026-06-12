// Find UI per the repo README ("Wiring a find UI"): the engine and RPC sides
// of search ship with the client; the input + result list is the embedder's.
// Searches loaded sheets only (lazy sheets join after their tab is visited).

import { useEffect, useRef, useState } from "react";

import { SearchInput } from "@dust-tt/sparkle";
import type { XlsxViewerController } from "@extend-ai/react-xlsx";

import type { SearchHit, SearchResults, SheetEngineClient, WorkbookHandle } from "@dust/sheet-engine-client";

interface SearchBoxProps {
  client: SheetEngineClient;
  handle: WorkbookHandle | null;
  controller: XlsxViewerController | null;
}

export function SearchBox({ client, handle, controller }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery("");
    setResults(null);
    setOpen(false);
  }, [handle]);

  useEffect(() => {
    if (!handle || query.trim() === "") {
      setResults(null);
      setOpen(false);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      client
        .search(handle, query, { maxResults: 100 })
        .then((r) => {
          if (!stale) {
            setResults(r);
            setOpen(true);
          }
        })
        .catch(() => {
          // A search racing a close/reload is not worth surfacing.
        });
    }, 150);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [client, handle, query]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.target instanceof Node && containerRef.current?.contains(e.target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const sheetName = (workbookSheetIndex: number): string =>
    controller?.tabs.find((t) => t.workbookSheetIndex === workbookSheetIndex)?.name ?? `sheet ${workbookSheetIndex}`;

  const jumpTo = (hit: SearchHit) => {
    if (!controller) {
      return;
    }
    // Tab index != workbook sheet index when hidden sheets are filtered out.
    const tab = controller.tabs.find((t) => t.workbookSheetIndex === hit.sheet);
    if (!tab) {
      return;
    }
    controller.setActiveTabIndex(tab.index);
    controller.selectCell({ row: hit.row, col: hit.col });
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-72">
      <SearchInput
        name="find-in-workbook"
        placeholder="Find in workbook"
        value={query}
        onChange={setQuery}
        onFocus={() => {
          if (results) {
            setOpen(true);
          }
        }}
        disabled={!handle}
      />
      {open && results && (
        <div className="absolute right-0 top-full z-20 mt-1 max-h-80 w-96 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {results.hits.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">No matches</div>}
          {results.hits.map((hit, i) => (
            <button
              key={`${hit.sheet}:${hit.a1}:${i}`}
              type="button"
              onClick={() => jumpTo(hit)}
              className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-slate-50"
            >
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                {hit.a1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{hit.snippet}</span>
              <span className="shrink-0 text-xs text-slate-400">{sheetName(hit.sheet)}</span>
            </button>
          ))}
          {results.capped && (
            <div className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
              First {results.hits.length} matches shown
            </div>
          )}
        </div>
      )}
    </div>
  );
}
