// Shared engine types crossing the worker boundary. All payloads are
// structured-clone-safe plain objects mirroring engine-core's serde output
// (camelCase via #[serde(rename_all = "camelCase")]).

export type EngineErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "ENCRYPTED"
  | "CORRUPT"
  | "BUDGET_EXCEEDED"
  | "CANCELLED"
  | "INTERNAL";

export interface EngineError {
  code: EngineErrorCode;
  detail: string;
}

export class EngineErrorException extends Error {
  readonly code: EngineErrorCode;
  readonly detail: string;

  constructor(error: EngineError) {
    super(`${error.code}${error.detail ? `: ${error.detail}` : ""}`);
    this.name = "EngineErrorException";
    this.code = error.code;
    this.detail = error.detail;
  }
}

const ENGINE_ERROR_CODES: ReadonlySet<string> = new Set([
  "UNSUPPORTED_FORMAT",
  "ENCRYPTED",
  "CORRUPT",
  "BUDGET_EXCEEDED",
  "CANCELLED",
  "INTERNAL",
]);

export function isEngineError(value: unknown): value is EngineError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { code?: unknown; detail?: unknown };
  return (
    typeof candidate.code === "string" &&
    ENGINE_ERROR_CODES.has(candidate.code) &&
    typeof candidate.detail === "string"
  );
}

export interface OpenOptions {
  maxBytes?: number;
  maxCellsPerSheet?: number;
  maxTotalCells?: number;
  /** CSV delimiter override; omitted = sniffed from content. Ignored for xlsx. */
  csvDelimiter?: "," | ";" | "\t" | "|";
}

export type SheetVisibility = "visible" | "hidden" | "veryHidden";

export interface SheetMeta {
  index: number;
  name: string;
  visibility: SheetVisibility;
  loaded: boolean;
  truncated: boolean;
  /** Last row with (possibly partial) data when `truncated`; rows from here
   * on may be missing cells. Absent when the sheet is complete. */
  truncatedAtRow?: number;
  cellCount: number;
  rowCount: number;
  colCount: number;
  frozenRows: number;
  frozenCols: number;
  defaultRowHeightPx: number;
  defaultColWidthPx: number;
  showGridLines: boolean;
}

export interface WorkbookMeta {
  sheets: SheetMeta[];
  date1904: boolean;
  definedNames: Array<[string, string]>;
  sharedStringCount: number;
  styleCount: number;
}

export type Align = "left" | "right" | "center";

export interface ResolvedStyle {
  numFmt: string;
  font: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    color?: string; // 8-hex ARGB
    sizePt?: number;
    name?: string;
  };
  fill?: {
    pattern: string;
    foreground?: string;
    background?: string;
  };
  border?: Partial<Record<"top" | "right" | "bottom" | "left", { style: string; color?: string }>>;
  alignment?: {
    horizontal?: string;
    vertical?: string;
    wrapText: boolean;
  };
}

export interface ViewportCell {
  row: number;
  col: number;
  text: string;
  align: Align;
  style: number;
  isDate: boolean;
  formula?: string;
  color?: string;
  mergeSpan?: [number, number];
  isMergedSecondary?: boolean;
  hyperlink?: string;
}

export interface CellRangeWire {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface ViewportSlice {
  sheet: number;
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  cells: ViewportCell[];
  merges: CellRangeWire[];
  styles: Record<number, ResolvedStyle>;
  rowHeightsPx: Array<[number, number]>;
  colWidthsPx: Array<[number, number]>;
}

export interface BatchCell {
  col: number;
  value: string;
  formula?: string;
  style?: number;
  mergeSpan?: { rowSpan: number; colSpan: number };
  isMergedSecondary?: boolean;
  hyperlink?: string;
  align: Align;
}

export interface BatchRow {
  index: number;
  cells: BatchCell[];
}

/** Sheet geometry mirror of engine-core `SheetDims`. */
export interface SheetGeometry {
  minRow: number;
  minCol: number;
  maxRow: number;
  maxCol: number;
  frozenRows: number;
  frozenCols: number;
  defaultRowHeightPx: number;
  defaultColWidthPx: number;
  colWidthsPx: Array<[number, number]>;
  rowHeightsPx: Array<[number, number]>;
  hiddenRows: number[];
  hiddenCols: number[];
}

export interface SearchOpts {
  maxResults?: number;
  sheet?: number;
}

export interface SearchHit {
  sheet: number;
  row: number;
  col: number;
  a1: string;
  snippet: string;
}

export interface SearchResults {
  hits: SearchHit[];
  capped: boolean;
}

export interface Progress {
  phase: "download" | "parse";
  loaded: number;
  total?: number;
}

/** A cancellable promise with progress reporting. */
export type Task<T> = Promise<T> & {
  progress: (cb: (p: Progress) => void) => Task<T>;
  cancel: () => void;
};

export type DisplayMode = "value" | "formula";

/** Opaque workbook handle. Kept as an object so FinalizationRegistry can track it. */
export interface WorkbookHandle {
  readonly id: number;
}
