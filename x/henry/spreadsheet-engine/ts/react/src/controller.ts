// Kit adapter (Strategy A, zero fork — see INTEGRATION.md): builds a plain
// object satisfying @extend-ai/react-xlsx's `XlsxViewerController` interface,
// backed by `@dust/sheet-engine-client`. The grid pulls rows through
// `getRowsBatchAsync` (worker-backed mode: `workbook: null`,
// `isWorkerBacked: true`) and reads geometry from populated axis arrays.

import type {
  XlsxCellAddress,
  XlsxCellRange,
  XlsxSheetData,
  XlsxViewerController,
  XlsxWorkbookTab,
} from "@extend-ai/react-xlsx";

/** The kit declares this type but does not export it; derive it. */
type XlsxResolvedCellStyle = XlsxSheetData["styleById"][number];

import type {
  Align,
  BatchRow,
  ResolvedStyle,
  SheetEngineClient,
  SheetGeometry,
  SheetMeta,
  WorkbookHandle,
  WorkbookMeta,
} from "@dust/sheet-engine-client";

/** Axis arrays only need to span the used range (the kit falls back to the
 * sheet defaults beyond); cap defensively for max-extent sheets. */
const MAX_AXIS_ENTRIES = 200_000;

function argbColor(argb: string | undefined): Record<string, unknown> | undefined {
  return argb ? { argb } : undefined;
}

/** Engine ResolvedStyle -> the kit's resolved style shape (consumed keys per
 * INTEGRATION.md §3.3). Colors arrive pre-resolved as 8-hex ARGB. */
export function toKitStyle(style: ResolvedStyle): XlsxResolvedCellStyle {
  const out: XlsxResolvedCellStyle = {};
  const font: Record<string, unknown> = {};
  if (style.font.bold) {
    font.bold = true;
  }
  if (style.font.italic) {
    font.italic = true;
  }
  if (style.font.underline) {
    font.underline = true;
  }
  if (style.font.strikethrough) {
    font.strikethrough = true;
  }
  if (style.font.color) {
    font.color = argbColor(style.font.color);
  }
  if (style.font.sizePt !== undefined) {
    font.size = style.font.sizePt;
  }
  if (style.font.name) {
    font.name = style.font.name;
  }
  if (Object.keys(font).length > 0) {
    out.font = font;
  }
  if (style.fill) {
    out.fill =
      style.fill.pattern === "solid"
        ? { fillType: "solid", color: argbColor(style.fill.foreground) }
        : {
            fillType: "pattern",
            foreground: argbColor(style.fill.foreground),
            background: argbColor(style.fill.background),
          };
  }
  if (style.border) {
    const border: Record<string, Record<string, unknown>> = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const s = style.border[side];
      if (s) {
        border[side] = { style: s.style, color: argbColor(s.color) };
      }
    }
    if (Object.keys(border).length > 0) {
      out.border = border;
    }
  }
  if (style.alignment) {
    out.alignment = {
      horizontal: style.alignment.horizontal,
      vertical: style.alignment.vertical,
      wrapText: style.alignment.wrapText || undefined,
    };
  }
  return out;
}

/** Style materialization cache: style index x alignment hint -> kit object.
 * The alignment hint covers Excel "General" alignment (numbers right, text
 * left) when the style itself has no explicit horizontal alignment. */
export class StyleCache {
  private styles: ResolvedStyle[];
  private cache = new Map<string, XlsxResolvedCellStyle>();

  constructor(styles: ResolvedStyle[]) {
    this.styles = styles;
  }

  get(index: number | undefined, align: Align): XlsxResolvedCellStyle | undefined {
    const idx = index ?? 0;
    const key = `${idx}:${align}`;
    const hit = this.cache.get(key);
    if (hit) {
      return hit;
    }
    const source = this.styles[idx];
    const kit = source ? toKitStyle(source) : {};
    if (align !== "left" && !kit.alignment?.horizontal) {
      kit.alignment = { ...kit.alignment, horizontal: align };
    }
    const result = Object.keys(kit).length > 0 ? kit : undefined;
    if (result) {
      this.cache.set(key, result);
    }
    return result;
  }
}

/** Map an engine rows batch to the JsRow shape the kit's grid consumes. */
export function toKitRows(rows: BatchRow[], styleCache: StyleCache): unknown[] {
  return rows.map((row) => ({
    index: row.index,
    cells: row.cells.map((cell) => ({
      col: cell.col,
      value: cell.value,
      formula: cell.formula,
      style: styleCache.get(cell.style, cell.align),
      mergeSpan: cell.mergeSpan,
      isMergedSecondary: cell.isMergedSecondary,
      hyperlink: cell.hyperlink ? { target: cell.hyperlink } : undefined,
    })),
  }));
}

function buildAxis(
  count: number,
  defaultSizePx: number,
  overrides: Array<[number, number]>,
  hidden: number[],
): { visible: number[]; sizes: number[] } {
  const limit = Math.min(count, MAX_AXIS_ENTRIES);
  const overrideMap = new Map(overrides);
  const hiddenSet = new Set(hidden);
  const visible: number[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < limit; i++) {
    if (hiddenSet.has(i)) {
      continue;
    }
    visible.push(i);
    sizes.push(overrideMap.get(i) ?? defaultSizePx);
  }
  return { visible, sizes };
}

/** Build the kit's XlsxSheetData for one loaded sheet. The axis arrays MUST be
 * populated: with `worksheet === null` they are the grid's only source of
 * row heights / column widths (INTEGRATION.md §3.2). */
export function toKitSheetData(
  meta: SheetMeta,
  geometry: SheetGeometry,
  styleById: Record<number, XlsxResolvedCellStyle>,
): XlsxSheetData {
  const rowCount = Math.max(meta.rowCount, 1);
  const colCount = Math.max(meta.colCount, 1);
  const rowsAxis = buildAxis(rowCount, geometry.defaultRowHeightPx, geometry.rowHeightsPx, geometry.hiddenRows);
  const colsAxis = buildAxis(colCount, geometry.defaultColWidthPx, geometry.colWidthsPx, geometry.hiddenCols);

  return {
    name: meta.name,
    visibility: meta.visibility,
    workbookSheetIndex: meta.index,
    rowCount,
    colCount,
    minUsedRow: geometry.minRow,
    minUsedCol: geometry.minCol,
    maxUsedRow: Math.max(meta.rowCount - 1, 0),
    maxUsedCol: Math.max(meta.colCount - 1, 0),
    freezePanes: meta.frozenRows > 0 || meta.frozenCols > 0 ? { row: meta.frozenRows, col: meta.frozenCols } : null,
    defaultRowHeightPx: meta.defaultRowHeightPx,
    defaultColWidthPx: meta.defaultColWidthPx,
    visibleRows: rowsAxis.visible,
    rowHeights: rowsAxis.sizes,
    visibleCols: colsAxis.visible,
    colWidths: colsAxis.sizes,
    hiddenRows: geometry.hiddenRows,
    hiddenCols: geometry.hiddenCols,
    rowHeightOverridesPx: Object.fromEntries(geometry.rowHeightsPx),
    colWidthOverridesPx: Object.fromEntries(geometry.colWidthsPx),
    rowStyleIds: {},
    colStyleIds: {},
    styleById,
    namedCellStyleByName: {},
    tableStyleByName: {},
    cachedFormulaValues: {},
    conditionalFormatRules: [],
    dataValidations: [],
    sparklines: [],
    showGridLines: meta.showGridLines,
    themePalette: { colorsByIndex: {} },
    hasHorizontalMerges: false,
    hasVerticalMerges: false,
    maxHorizontalMergeEndCol: 0,
    maxVerticalMergeEndRow: 0,
  };
}

export interface ControllerState {
  client: SheetEngineClient;
  handle: WorkbookHandle;
  meta: WorkbookMeta;
  sheets: XlsxSheetData[];
  /** Indices into meta.sheets for the entries of `sheets` (visible-or-shown order). */
  sheetIndices: number[];
  styleCache: StyleCache;
  displayFileName: string;
}

/** Load a workbook and assemble everything the controller needs. Sheets other
 * than the first stay lazy: their XlsxSheetData is built on activation. */
export async function loadControllerState(
  client: SheetEngineClient,
  src: { url: string } | { bytes: ArrayBuffer },
  fileName: string,
  options?: { showHiddenSheets?: boolean; maxCellsPerSheet?: number; maxTotalCells?: number },
): Promise<ControllerState> {
  const handle = await client.open(src, fileName, {
    maxCellsPerSheet: options?.maxCellsPerSheet,
    maxTotalCells: options?.maxTotalCells,
  });
  const meta = await client.getMetadata(handle);
  const styles = await client.getStyles(handle);
  const styleCache = new StyleCache(styles);

  const styleById: Record<number, XlsxResolvedCellStyle> = {};
  styles.forEach((s, i) => {
    styleById[i] = toKitStyle(s);
  });

  let shown = meta.sheets.filter((s) => options?.showHiddenSheets || s.visibility === "visible");
  const sheetIndices = shown.map((s) => s.index);

  let refreshedMeta = meta;
  const sheets: XlsxSheetData[] = [];
  for (const sheetMeta of shown) {
    if (sheets.length === 0) {
      // First shown sheet: activate eagerly so first paint has data, then
      // refresh workbook metadata so truncation flags reflect the parse.
      const activated = await client.activateSheet(handle, sheetMeta.index);
      const geometry = await client.getSheetGeometry(handle, sheetMeta.index);
      sheets.push(toKitSheetData(activated, geometry, styleById));
      refreshedMeta = await client.getMetadata(handle);
      shown = refreshedMeta.sheets.filter((s) => options?.showHiddenSheets || s.visibility === "visible");
    } else {
      // Placeholder until activation; geometry defaults, no cells yet.
      sheets.push(
        toKitSheetData(
          sheetMeta,
          {
            minRow: 0,
            minCol: 0,
            maxRow: Math.max(sheetMeta.rowCount - 1, 0),
            maxCol: Math.max(sheetMeta.colCount - 1, 0),
            frozenRows: 0,
            frozenCols: 0,
            defaultRowHeightPx: sheetMeta.defaultRowHeightPx,
            defaultColWidthPx: sheetMeta.defaultColWidthPx,
            colWidthsPx: [],
            rowHeightsPx: [],
            hiddenRows: [],
            hiddenCols: [],
          },
          styleById,
        ),
      );
    }
  }

  return { client, handle, meta: refreshedMeta, sheets, sheetIndices, styleCache, displayFileName: fileName };
}

export function buildTabs(state: ControllerState): XlsxWorkbookTab[] {
  return state.sheets.map((sheet, i) => ({
    id: `sheet-${state.sheetIndices[i]}`,
    index: i,
    kind: "sheet" as const,
    name: sheet.name,
    sheetIndex: i,
    visibility: sheet.visibility,
    workbookSheetIndex: state.sheetIndices[i],
  }));
}

const NOOP = () => {};
const ASYNC_FALSE = async () => false;

/** Assemble the full XlsxViewerController. Everything data-bearing is real;
 * editing/chart/image surfaces are inert stubs (read-only viewer). */
export function buildController(
  state: ControllerState,
  view: {
    activeSheetIndex: number;
    selection: XlsxCellRange | null;
    activeCell: XlsxCellAddress | null;
    zoomScale: number;
    revision: number;
  },
  actions: {
    setActiveSheetIndex: (index: number) => void;
    selectCell: (cell: XlsxCellAddress, options?: { extend?: boolean }) => void;
    selectRange: (range: XlsxCellRange) => void;
    clearSelection: () => void;
    setZoomScale: (scale: number) => void;
    getRowsBatchAsync: (workbookSheetIndex: number, startRow: number, rowCount: number) => Promise<unknown[] | null>;
    getCellDisplayValue: (cell?: XlsxCellAddress | null) => string;
    getCellFormula: (cell?: XlsxCellAddress | null) => string;
  },
): XlsxViewerController {
  const activeSheet = state.sheets[view.activeSheetIndex] ?? null;
  const tabs = buildTabs(state);
  const a1 = (cell: XlsxCellAddress | null) =>
    cell ? `${colLetters(cell.col)}${cell.row + 1}` : null;

  const controller = {
    // --- workbook data (real) ---
    sheets: state.sheets,
    activeSheet,
    activeSheetIndex: view.activeSheetIndex,
    tabs,
    activeTab: tabs[view.activeSheetIndex] ?? null,
    activeTabIndex: view.activeSheetIndex,
    displayFileName: state.displayFileName,
    error: null,
    isLoading: false,
    isLoadDeferred: false,
    canLoadDeferred: false,
    deferredLoadFileSize: null,
    continueDeferredLoad: NOOP,
    revision: view.revision,
    readOnly: true,
    isWorkerBacked: true,
    workbook: null,
    getActiveWorksheet: () => null,
    getRowsBatchAsync: actions.getRowsBatchAsync,
    // --- view state (kit zoom is a PERCENTAGE: 100 = 100%) ---
    zoomScale: view.zoomScale,
    defaultZoomScale: 100,
    minZoomScale: 10,
    maxZoomScale: 400,
    canZoomIn: view.zoomScale < 400,
    canZoomOut: view.zoomScale > 10,
    zoomIn: () => actions.setZoomScale(Math.min(view.zoomScale + 10, 400)),
    zoomOut: () => actions.setZoomScale(Math.max(view.zoomScale - 10, 10)),
    resetZoom: () => actions.setZoomScale(100),
    setZoomScale: actions.setZoomScale,
    setActiveSheetIndex: actions.setActiveSheetIndex,
    setActiveTabIndex: actions.setActiveSheetIndex,
    // --- selection (display only) ---
    selection: view.selection,
    activeCell: view.activeCell,
    activeCellAddress: a1(view.activeCell),
    selectedRangeAddress: view.selection
      ? `${colLetters(view.selection.start.col)}${view.selection.start.row + 1}:${colLetters(view.selection.end.col)}${view.selection.end.row + 1}`
      : null,
    selectCell: actions.selectCell,
    selectRange: actions.selectRange,
    clearSelection: actions.clearSelection,
    selectedValue: actions.getCellDisplayValue(view.activeCell),
    selectedFormula: actions.getCellFormula(view.activeCell),
    getCellDisplayValue: actions.getCellDisplayValue,
    getCellFormula: actions.getCellFormula,
    // --- collections (empty: out of scope for the viewer path) ---
    tables: [],
    charts: [],
    chartsheets: [],
    images: [],
    shapes: [],
    formControls: [],
    isChartsLoading: false,
    sortState: null,
    selectedChart: null,
    selectedChartId: null,
    selectedImage: null,
    selectedImageId: null,
    // --- capabilities ---
    canDownload: false,
    canExport: false,
    canUndo: false,
    canRedo: false,
    // --- inert stubs (editing / charts / images / export) ---
    addSheet: NOOP,
    removeActiveSheet: NOOP,
    clearSelectedCells: NOOP,
    clearSelectedChart: NOOP,
    clearSelectedImage: NOOP,
    copySelectionToClipboard: ASYNC_FALSE,
    pasteFromClipboard: ASYNC_FALSE,
    pasteStructuredClipboardData: () => false,
    pasteText: () => false,
    defineNamedRange: NOOP,
    download: NOOP,
    exportCsv: NOOP,
    exportXlsx: NOOP,
    fillSelection: NOOP,
    getChartById: () => null,
    getChartsheetById: () => null,
    getImageById: () => null,
    getSheetCharts: () => [],
    getSheetFormControls: () => [],
    getSheetImages: () => [],
    getSheetShapes: () => [],
    getClipboardData: () => null,
    mergeSelection: NOOP,
    unmergeSelection: NOOP,
    moveChartBy: NOOP,
    moveImageBy: NOOP,
    recalculate: NOOP,
    redo: NOOP,
    undo: NOOP,
    resizeChartBy: NOOP,
    resizeImageBy: NOOP,
    resizeColumn: NOOP,
    resizeRow: NOOP,
    selectChart: NOOP,
    selectImage: NOOP,
    setCellFormula: NOOP,
    setCellValue: NOOP,
    setChartRect: NOOP,
    setImageRect: NOOP,
    setSelectedCellFormula: NOOP,
    setSelectedCellValue: NOOP,
    sortTable: NOOP,
    updateChart: NOOP,
  };
  return controller as unknown as XlsxViewerController;
}

export function colLetters(col: number): string {
  let n = col + 1;
  let out = "";
  while (n > 0) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
