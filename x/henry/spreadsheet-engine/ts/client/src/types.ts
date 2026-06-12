// Shared engine types crossing the worker boundary.
//
// Everything that mirrors engine-core serde output lives in ./generated —
// emitted by ts-rs from the Rust structs themselves (run
// `TS_RS_EXPORT_DIR=$PWD/ts/client/src/generated cargo test -p engine-core
// --features ts-rs --lib export_bindings`, gated for freshness in
// check-all.sh) — so the two sides cannot drift. Only types with no Rust
// counterpart (protocol/task plumbing, client-side options) are hand-written
// here. The re-export list below is the one manual step: a newly
// generated type must be added here to become part of the public surface.

export type { Align } from "./generated/Align";
export type { Alignment } from "./generated/Alignment";
export type { BatchCell } from "./generated/BatchCell";
export type { BatchRow } from "./generated/BatchRow";
export type { Border } from "./generated/Border";
export type { BorderSide } from "./generated/BorderSide";
export type { CellRangeWire } from "./generated/CellRangeWire";
export type { DisplayMode } from "./generated/DisplayMode";
export type { Fill } from "./generated/Fill";
export type { Font } from "./generated/Font";
export type { MergeSpan } from "./generated/MergeSpan";
export type { ResolvedStyle } from "./generated/ResolvedStyle";
export type { SearchHit } from "./generated/SearchHit";
export type { SearchOpts } from "./generated/SearchOpts";
export type { SearchResults } from "./generated/SearchResults";
export type { SheetGeometry } from "./generated/SheetGeometry";
export type { SheetMeta } from "./generated/SheetMeta";
export type { SheetVisibility } from "./generated/SheetVisibility";
export type { ViewportCell } from "./generated/ViewportCell";
export type { ViewportSlice } from "./generated/ViewportSlice";
export type { WorkbookMeta } from "./generated/WorkbookMeta";

export type EngineErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "ENCRYPTED"
  | "CORRUPT"
  | "BUDGET_EXCEEDED"
  | "CANCELLED"
  | "INTERNAL"
  // The worker's wasm instance trapped: linear memory may be corrupt, and
  // every later call on this client answers POISONED too. Terminal for the
  // client — destroy() it, spawn a fresh worker, reopen the workbook.
  // `SheetEngineClient.onFatal` fires once when this is first observed.
  | "POISONED";

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
  "POISONED",
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

/** Open knobs; parsed engine-side (wasm `open_start`), not serde-mirrored. */
export interface OpenOptions {
  maxBytes?: number;
  maxCellsPerSheet?: number;
  maxTotalCells?: number;
  /** CSV delimiter override; omitted = sniffed from content. Ignored for xlsx. */
  csvDelimiter?: "," | ";" | "\t" | "|";
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

/** Opaque workbook handle. Kept as an object so FinalizationRegistry can track it. */
export interface WorkbookHandle {
  readonly id: number;
}
