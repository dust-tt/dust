import { useEffect, useMemo, useRef, useState } from "react";

import { BoltIcon, Chip, DustLogo, Spinner } from "@dust-tt/sparkle";
import { XlsxViewer } from "@extend-ai/react-xlsx";

import { useDustSheetController } from "@dust/sheet-engine-react";

import { ErrorPanel } from "./components/ErrorPanel";
import { SearchBox } from "./components/SearchBox";
import { Sidebar } from "./components/Sidebar";
import { SAMPLES } from "./samples";
import type { SheetSource } from "./source";
import { useEngineClient } from "./use-engine-client";

export function App() {
  const { client, generation, reset } = useEngineClient();
  const [source, setSource] = useState<SheetSource | null>(() => ({
    kind: "sample",
    fileName: SAMPLES[0].fileName,
    src: { url: SAMPLES[0].url },
  }));
  const [dragging, setDragging] = useState(false);

  // Bytes are TRANSFERRED to the worker on open, which detaches the buffer.
  // Keep the original in `source` and hand the hook a fresh copy per client
  // generation so "Reload viewer" after a POISONED trap can reopen the file.
  const hookSrc = useMemo(() => {
    if (!source) {
      return null;
    }
    if ("url" in source.src) {
      return { ...source.src };
    }
    return { bytes: source.src.bytes.slice(0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation forces a fresh copy after reset()
  }, [source, generation]);

  const { controller, handle, loading, error, truncated } = useDustSheetController({
    client,
    src: hookSrc,
    fileName: source?.fileName ?? "untitled",
  });

  // Open-to-interactive timing (includes download; parse happens in the
  // worker off the main thread).
  const openStartRef = useRef<number>(performance.now());
  const [openMs, setOpenMs] = useState<number | null>(null);
  useEffect(() => {
    openStartRef.current = performance.now();
    setOpenMs(null);
  }, [hookSrc]);
  useEffect(() => {
    if (controller && openMs === null) {
      setOpenMs(performance.now() - openStartRef.current);
    }
  }, [controller, openMs]);

  const openDropped = (files: FileList) => {
    const file = files[0];
    if (!file) {
      return;
    }
    void file.arrayBuffer().then((bytes) => {
      setSource({ kind: "file", fileName: file.name, src: { bytes } });
    });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
        <DustLogo className="h-5 w-auto" />
        <div className="h-5 w-px bg-slate-200" />
        <span className="text-sm font-semibold text-slate-900">Sheets</span>
        <Chip size="xs" color="info" icon={BoltIcon} label="Rust + WASM engine" />
        {source && (
          <span className="ml-2 truncate text-sm text-slate-500" title={source.fileName}>
            {source.fileName}
          </span>
        )}
        {truncated && <Chip size="xs" color="warning" label="Truncated preview" />}
        <div className="ml-auto flex items-center gap-3">
          {openMs !== null && !loading && !error && (
            <span className="text-xs text-slate-400">opened in {Math.max(1, Math.round(openMs))} ms</span>
          )}
          <SearchBox client={client} handle={handle} controller={controller} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar current={source} onOpen={setSource} />

        <main
          className="relative flex min-w-0 flex-1 flex-col"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            openDropped(e.dataTransfer.files);
          }}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-blue-400 bg-blue-50/80">
              <span className="text-sm font-medium text-blue-700">Drop an .xlsx or .csv to open it</span>
            </div>
          )}

          <div className="min-h-0 flex-1 p-3">
            {error ? (
              <ErrorPanel error={error} onResetViewer={reset} />
            ) : loading || !controller ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <Spinner size="md" />
                <span className="text-sm text-slate-500">Parsing in the worker...</span>
              </div>
            ) : (
              <XlsxViewer
                key={generation}
                controller={controller}
                readOnly
                showImages={false}
                // Kit 0.10.2 computes its batch-request window from the DOM
                // virtualizer only, so the canvas renderer never pulls
                // worker-backed rows; the DOM renderer is the supported path.
                experimentalCanvas={false}
                height="100%"
              />
            )}
          </div>

          <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-slate-200 px-4 text-xs text-slate-500">
            {controller && (
              <>
                <span>
                  {controller.tabs.length} sheet{controller.tabs.length === 1 ? "" : "s"}
                </span>
                {controller.activeCellAddress && (
                  <span className="font-mono">
                    {controller.activeCellAddress}
                    {controller.selectedValue ? ` = ${controller.selectedValue}` : ""}
                  </span>
                )}
                {controller.selectedFormula && (
                  <span className="truncate font-mono text-slate-400">{controller.selectedFormula}</span>
                )}
              </>
            )}
            <span className="ml-auto text-slate-400">
              Workbook lives in WASM memory; the grid pulls visible rows on demand.
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
