// React hook: load a workbook (xlsx/csv) through the engine worker and expose
// a kit-compatible XlsxViewerController. Identity discipline per
// INTEGRATION.md §4: `getRowsBatchAsync` keeps a stable identity, the
// controller is memoized, `revision` bumps on every data change.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { XlsxCellAddress, XlsxCellRange, XlsxViewerController } from "@extend-ai/react-xlsx";

import type { BatchRow, SheetEngineClient } from "@dust/sheet-engine-client";
import { EngineErrorException } from "@dust/sheet-engine-client";

import { buildController, loadControllerState, toKitRows, toKitSheetData, type ControllerState } from "./controller";

export interface UseDustSheetControllerOptions {
  /** Engine client. The caller owns its lifecycle (one worker per document). */
  client: SheetEngineClient;
  /**
   * Workbook source: remote URL (worker-side streaming fetch) or bytes.
   * URL validation is the embedder's responsibility (see
   * `SheetEngineClient.open`); `null` renders nothing and keeps the hook idle.
   */
  src: { url: string } | { bytes: ArrayBuffer } | null;
  /** Display name; also drives format sniffing for CSV/TSV sources. */
  fileName: string;
  /** Include hidden/veryHidden sheets as tabs (default: visible only). */
  showHiddenSheets?: boolean;
  /** Per-sheet cell budget override (default 2,000,000). Exceeding sheets
   * load a row-major prefix and set `truncated`. */
  maxCellsPerSheet?: number;
  /** Whole-workbook cell budget override (default 8,000,000). Sheets beyond
   * it stay unloaded; activating them fails with BUDGET_EXCEEDED and the tab
   * stays a placeholder. */
  maxTotalCells?: number;
}

export interface DustSheetControllerResult {
  /** Plug into `<XlsxViewer controller={...} />`. Null while loading. */
  controller: XlsxViewerController | null;
  loading: boolean;
  error: EngineErrorException | null;
  /** True when any loaded sheet was truncated by a budget (show a banner). */
  truncated: boolean;
}

export function useDustSheetController(options: UseDustSheetControllerOptions): DustSheetControllerResult {
  const { client, src, fileName } = options;
  const [state, setState] = useState<ControllerState | null>(null);
  const [error, setError] = useState<EngineErrorException | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [selection, setSelection] = useState<XlsxCellRange | null>(null);
  const [activeCell, setActiveCell] = useState<XlsxCellAddress | null>(null);
  // Kit convention: zoom is a percentage (100 = 100%).
  const [zoomScale, setZoomScale] = useState(100);
  const [revision, setRevision] = useState(0);
  // Forces a re-render after each delivered batch WITHOUT touching
  // `revision`: the kit clears its committed row batch on revision changes,
  // but its cell-render cache is only cleared in an effect after the
  // batch-commit render — so the commit render itself paints stale (empty)
  // cached cells. A post-commit identity change repaints from the fresh
  // batch. See INTEGRATION.md ("paint tick").
  const [paintTick, setPaintTick] = useState(0);

  const stateRef = useRef<ControllerState | null>(null);
  stateRef.current = state;
  /** Last delivered batch per workbook sheet index (formula-bar lookups). */
  const lastBatchRef = useRef<Map<number, BatchRow[]>>(new Map());
  /** Workbook sheet indices already activated engine-side. */
  const activatedRef = useRef<Set<number>>(new Set());
  /** Mirrors activeSheetIndex for non-render lookups (formula bar). */
  const activeSheetIndexRef = useRef(0);
  /** Pending paint-tick timers, cleared on unmount. */
  const paintTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  /** True once the component unmounted: batches resolving after cleanup must
   * not schedule timers, and already-fired timers must not setState. */
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      for (const timer of paintTimersRef.current) {
        clearTimeout(timer);
      }
      paintTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!src) {
      return;
    }
    let disposed = false;
    // Set inside the .then (not via render-time stateRef) so an unmount that
    // lands between load-resolve and React's commit still closes the handle.
    let loadedState: ControllerState | null = null;
    setState(null);
    setError(null);
    setActiveSheetIndex(0);
    activeSheetIndexRef.current = 0;
    lastBatchRef.current = new Map();
    activatedRef.current = new Set();

    loadControllerState(client, src, fileName, {
      showHiddenSheets: options.showHiddenSheets,
      maxCellsPerSheet: options.maxCellsPerSheet,
      maxTotalCells: options.maxTotalCells,
    })
      .then((loaded) => {
        if (disposed) {
          loaded.client.close(loaded.handle).catch(() => {});
          return;
        }
        loadedState = loaded;
        activatedRef.current.add(loaded.sheetIndices[0]);
        setState(loaded);
        setRevision((r) => r + 1);
      })
      .catch((e: unknown) => {
        if (!disposed) {
          setError(
            e instanceof EngineErrorException ? e : new EngineErrorException({ code: "INTERNAL", detail: String(e) }),
          );
        }
      });

    return () => {
      disposed = true;
      for (const timer of paintTimersRef.current) {
        clearTimeout(timer);
      }
      paintTimersRef.current = [];
      if (loadedState) {
        // Benign race: the owner may destroy() the client before unmount.
        loadedState.client.close(loadedState.handle).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- src identity governs reload
  }, [client, src, fileName]);

  const getRowsBatchAsync = useCallback(
    async (workbookSheetIndex: number, startRow: number, rowCount: number): Promise<unknown[] | null> => {
      const current = stateRef.current;
      if (!current) {
        return null;
      }
      try {
        if (!activatedRef.current.has(workbookSheetIndex)) {
          await current.client.activateSheet(current.handle, workbookSheetIndex);
          activatedRef.current.add(workbookSheetIndex);
        }
        const rows = await current.client.getRowsBatch(current.handle, workbookSheetIndex, startRow, rowCount);
        lastBatchRef.current.set(workbookSheetIndex, rows);
        // Post-commit paint ticks (NOT a revision bump — that would clear the
        // batch we just delivered). Staggered because the grid commits the
        // batch inside startTransition, which may land after our first tick
        // under load; cleared on unmount, and gated on the unmount flag so a
        // batch resolving after cleanup cannot setState on a dead component.
        if (!unmountedRef.current) {
          for (const delayMs of [0, 120, 400]) {
            paintTimersRef.current.push(
              setTimeout(() => {
                if (!unmountedRef.current) {
                  setPaintTick((t) => t + 1);
                }
              }, delayMs),
            );
          }
        }
        return toKitRows(rows, current.styleCache);
      } catch (e: unknown) {
        // Budget-refused sheets degrade to empty cells; anything else (incl.
        // a poisoned worker reporting INTERNAL) must surface, not render a
        // silently blank grid.
        if (e instanceof EngineErrorException && (e.code === "BUDGET_EXCEEDED" || e.code === "CANCELLED")) {
          return null;
        }
        setError(
          e instanceof EngineErrorException ? e : new EngineErrorException({ code: "INTERNAL", detail: String(e) }),
        );
        return null;
      }
    },
    [],
  );

  const activateAndRefresh = useCallback((tabIndex: number) => {
    const current = stateRef.current;
    activeSheetIndexRef.current = tabIndex;
    setActiveSheetIndex(tabIndex);
    setSelection(null);
    setActiveCell(null);
    if (!current) {
      return;
    }
    const workbookSheetIndex = current.sheetIndices[tabIndex];
    if (workbookSheetIndex === undefined || activatedRef.current.has(workbookSheetIndex)) {
      return;
    }
    void (async () => {
      try {
        const meta = await current.client.activateSheet(current.handle, workbookSheetIndex);
        activatedRef.current.add(workbookSheetIndex);
        const geometry = await current.client.getSheetGeometry(current.handle, workbookSheetIndex);
        const styleById = current.sheets[0]?.styleById ?? {};
        const refreshed = [...current.sheets];
        refreshed[tabIndex] = toKitSheetData(meta, geometry, styleById);
        const next = { ...current, sheets: refreshed };
        stateRef.current = next;
        setState(next);
        setRevision((r) => r + 1);
      } catch {
        // Activation can fail with BUDGET_EXCEEDED: tab stays a placeholder.
      }
    })();
  }, []);

  const lookupCell = useCallback((cell: XlsxCellAddress | null | undefined, field: "value" | "formula"): string => {
    const current = stateRef.current;
    if (!current || !cell) {
      return "";
    }
    // Formula bar reads the ACTIVE sheet's last delivered batch.
    const sheetIdx = current.sheetIndices[activeSheetIndexRef.current] ?? current.sheetIndices[0];
    const batches = lastBatchRef.current.get(sheetIdx) ?? [];
    for (const row of batches) {
      if (row.index !== cell.row) {
        continue;
      }
      const found = row.cells.find((c) => c.col === cell.col);
      if (!found) {
        return "";
      }
      return field === "value" ? found.value : found.formula ? `=${found.formula}` : "";
    }
    return "";
  }, []);

  const selectCell = useCallback((cell: XlsxCellAddress, opts?: { extend?: boolean }) => {
    setActiveCell(cell);
    setSelection((previous) =>
      opts?.extend && previous ? { start: previous.start, end: cell } : { start: cell, end: cell },
    );
  }, []);
  const selectRange = useCallback((range: XlsxCellRange) => {
    setSelection(range);
    setActiveCell(range.start);
  }, []);
  const clearSelection = useCallback(() => {
    setSelection(null);
    setActiveCell(null);
  }, []);

  const controller = useMemo(() => {
    if (!state) {
      return null;
    }
    // paintTick is intentionally a dependency with no other use: a fresh
    // controller identity is what triggers the post-batch repaint.
    void paintTick;
    return buildController(
      state,
      { activeSheetIndex, selection, activeCell, zoomScale, revision },
      {
        setActiveSheetIndex: activateAndRefresh,
        selectCell,
        selectRange,
        clearSelection,
        setZoomScale,
        getRowsBatchAsync,
        getCellDisplayValue: (cell) => lookupCell(cell ?? activeCell, "value"),
        getCellFormula: (cell) => lookupCell(cell ?? activeCell, "formula"),
      },
    );
  }, [
    state,
    activeSheetIndex,
    selection,
    activeCell,
    zoomScale,
    revision,
    paintTick,
    activateAndRefresh,
    selectCell,
    selectRange,
    clearSelection,
    getRowsBatchAsync,
    lookupCell,
  ]);

  return {
    controller,
    loading: !state && !error && src !== null,
    error,
    truncated: state?.meta.sheets.some((s) => s.truncated) ?? false,
  };
}
