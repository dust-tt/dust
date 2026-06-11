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
  /** Workbook source: remote URL (worker-side streaming fetch) or bytes. */
  src: { url: string } | { bytes: ArrayBuffer } | null;
  fileName: string;
  showHiddenSheets?: boolean;
  maxCellsPerSheet?: number;
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

  useEffect(() => {
    if (!src) {
      return;
    }
    let disposed = false;
    setState(null);
    setError(null);
    setActiveSheetIndex(0);
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
      const current = stateRef.current;
      if (current) {
        // Benign race: the owner may destroy() the client before unmount.
        current.client.close(current.handle).catch(() => {});
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
        // under load. See the paintTick comment above.
        for (const delayMs of [0, 120, 400]) {
          setTimeout(() => setPaintTick((t) => t + 1), delayMs);
        }
        return toKitRows(rows, current.styleCache);
      } catch {
        // Budget-refused sheets and races on unmount degrade to empty cells.
        return null;
      }
    },
    [],
  );

  const activateAndRefresh = useCallback((tabIndex: number) => {
    const current = stateRef.current;
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
    const sheetIdx = current.sheetIndices[0]; // formula bar follows the active sheet's batches
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
