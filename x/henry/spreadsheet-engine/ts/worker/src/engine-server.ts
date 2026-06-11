// Transport-agnostic engine server: wires the RPC protocol to the wasm module.
// The browser worker entry and the Node test host both delegate here, so the
// exact code that ships is what the vitest suites exercise.
//
// Trap policy: a Rust panic on wasm32 is a trap that surfaces as a JS
// RuntimeError (stable wasm has no unwinding, so the Rust side cannot
// catch_unwind). We catch it here, answer INTERNAL, and mark the instance
// poisoned: every later call also answers INTERNAL and the client is expected
// to destroy() this worker and spawn a fresh one. A corrupt file can never
// take down the worker silently (spec §4, adapted to stable wasm).

import type { EngineRequest, EngineResponse } from "@dust/sheet-engine-client/protocol";
import { isEngineError } from "@dust/sheet-engine-client/types";
import type { EngineError, Progress } from "@dust/sheet-engine-client/types";

/** The wasm-bindgen module surface (web and nodejs builds are identical). */
export interface EngineWasm {
  open_start(fileName: string, optsJson: string | null): number;
  append_chunk(handle: number, chunk: Uint8Array): void;
  open_finish(handle: number): string;
  get_metadata(handle: number): string;
  activate_sheet(handle: number, sheet: number): string;
  get_viewport(
    handle: number,
    sheet: number,
    rowStart: number,
    rowEnd: number,
    colStart: number,
    colEnd: number,
    mode: string,
  ): string;
  get_rows_batch(handle: number, sheet: number, startRow: number, rowCount: number): string;
  get_styles(handle: number): string;
  get_sheet_geometry(handle: number, sheet: number): string;
  search(handle: number, query: string, optsJson: string | null): string;
  canonical_json(handle: number): string;
  close(handle: number): void;
  open_handle_count(): number;
  memory_pages(): number;
  init_panic_hook(): void;
}

export interface EngineServerOptions {
  wasm: EngineWasm;
  post: (response: EngineResponse) => void;
  /** Override for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

function parseEngineError(raw: unknown): EngineError {
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isEngineError(parsed)) {
        return parsed;
      }
    } catch {
      // fall through
    }
    return { code: "INTERNAL", detail: raw };
  }
  if (raw instanceof Error) {
    return { code: "INTERNAL", detail: `${raw.name}: ${raw.message}` };
  }
  return { code: "INTERNAL", detail: String(raw) };
}

const PROGRESS_EVERY_BYTES = 4 * 1024 * 1024;

export function createEngineServer(options: EngineServerOptions) {
  const { wasm, post } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  wasm.init_panic_hook();

  /** Set after a wasm trap: linear memory may be corrupt, nothing is safe. */
  let poisoned: EngineError | null = null;
  /** AbortControllers for in-flight URL downloads, keyed by request id. */
  const downloads = new Map<number, AbortController>();
  /** Request ids cancelled before completion. */
  const cancelled = new Set<number>();

  function reply(id: number, result: unknown): void {
    post({ id, kind: "ok", result });
  }

  function replyError(id: number, error: EngineError): void {
    post({ id, kind: "error", error });
  }

  function replyProgress(id: number, progress: Progress): void {
    post({ id, kind: "progress", progress });
  }

  function guarded(id: number, fn: () => void): void {
    if (poisoned) {
      replyError(id, poisoned);
      return;
    }
    try {
      fn();
    } catch (raw) {
      // RuntimeError = wasm trap (Rust panic/abort): poison the instance.
      // Matched on the error class name only; message contents are too easy
      // to collide with ordinary JS errors.
      if (raw instanceof Error && raw.name === "RuntimeError") {
        poisoned = { code: "INTERNAL", detail: `engine trapped: ${raw.message}; worker must be recreated` };
        replyError(id, poisoned);
        return;
      }
      replyError(id, parseEngineError(raw));
    }
  }

  async function handleOpen(
    request: Extract<EngineRequest, { op: "open" }>,
  ): Promise<void> {
    const { id, fileName } = request;
    if (poisoned) {
      replyError(id, poisoned);
      return;
    }
    const optsJson = request.options ? JSON.stringify(request.options) : null;
    let handle: number | null = null;
    try {
      handle = wasm.open_start(fileName, optsJson);
      if ("bytes" in request && request.bytes) {
        const bytes = new Uint8Array(request.bytes);
        // Feed in slices so chunked-vs-oneshot equivalence is exercised on
        // every open, and budget violations surface before full buffering.
        for (let offset = 0; offset < bytes.length; offset += PROGRESS_EVERY_BYTES) {
          if (cancelled.has(id)) {
            throw JSON.stringify({ code: "CANCELLED", detail: "" });
          }
          wasm.append_chunk(handle, bytes.subarray(offset, offset + PROGRESS_EVERY_BYTES));
          replyProgress(id, { phase: "download", loaded: Math.min(offset + PROGRESS_EVERY_BYTES, bytes.length), total: bytes.length });
        }
        if (bytes.length === 0) {
          replyProgress(id, { phase: "download", loaded: 0, total: 0 });
        }
      } else if (request.url) {
        const controller = new AbortController();
        downloads.set(id, controller);
        const response = await fetchImpl(request.url, { signal: controller.signal });
        if (!response.ok) {
          throw JSON.stringify({ code: "CORRUPT", detail: `fetch failed: HTTP ${response.status}` });
        }
        const total = Number(response.headers.get("content-length")) || undefined;
        const reader = response.body?.getReader();
        if (!reader) {
          const buf = new Uint8Array(await response.arrayBuffer());
          wasm.append_chunk(handle, buf);
          replyProgress(id, { phase: "download", loaded: buf.length, total });
        } else {
          let loaded = 0;
          let lastReport = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            if (cancelled.has(id)) {
              controller.abort();
              throw JSON.stringify({ code: "CANCELLED", detail: "" });
            }
            wasm.append_chunk(handle, value);
            loaded += value.length;
            if (loaded - lastReport >= PROGRESS_EVERY_BYTES || loaded === total) {
              replyProgress(id, { phase: "download", loaded, total });
              lastReport = loaded;
            }
          }
        }
        downloads.delete(id);
      } else {
        throw JSON.stringify({ code: "INTERNAL", detail: "open: neither url nor bytes" });
      }

      if (cancelled.has(id)) {
        throw JSON.stringify({ code: "CANCELLED", detail: "" });
      }
      replyProgress(id, { phase: "parse", loaded: 0 });
      const meta = JSON.parse(wasm.open_finish(handle));
      replyProgress(id, { phase: "parse", loaded: 1, total: 1 });
      reply(id, { handle, meta });
    } catch (raw) {
      if (handle !== null) {
        try {
          wasm.close(handle);
        } catch {
          // Closing a half-open handle must never mask the original error.
        }
      }
      if (raw instanceof Error && raw.name === "RuntimeError") {
        poisoned = { code: "INTERNAL", detail: `engine trapped: ${raw.message}; worker must be recreated` };
        replyError(id, poisoned);
        return;
      }
      if (raw instanceof Error && raw.name === "AbortError") {
        replyError(id, { code: "CANCELLED", detail: "" });
        return;
      }
      replyError(id, parseEngineError(raw));
    } finally {
      downloads.delete(id);
      cancelled.delete(id);
    }
  }

  return {
    handle(request: EngineRequest): void {
      switch (request.op) {
        case "open":
          void handleOpen(request);
          break;
        case "metadata":
          guarded(request.id, () => reply(request.id, JSON.parse(wasm.get_metadata(request.handle))));
          break;
        case "activateSheet":
          guarded(request.id, () => reply(request.id, JSON.parse(wasm.activate_sheet(request.handle, request.sheet))));
          break;
        case "viewport":
          guarded(request.id, () =>
            reply(
              request.id,
              JSON.parse(
                wasm.get_viewport(
                  request.handle,
                  request.sheet,
                  request.rows[0],
                  request.rows[1],
                  request.cols[0],
                  request.cols[1],
                  request.mode,
                ),
              ),
            ),
          );
          break;
        case "rowsBatch":
          guarded(request.id, () =>
            reply(request.id, JSON.parse(wasm.get_rows_batch(request.handle, request.sheet, request.startRow, request.rowCount))),
          );
          break;
        case "styles":
          guarded(request.id, () => reply(request.id, JSON.parse(wasm.get_styles(request.handle))));
          break;
        case "geometry":
          guarded(request.id, () => reply(request.id, JSON.parse(wasm.get_sheet_geometry(request.handle, request.sheet))));
          break;
        case "search":
          guarded(request.id, () =>
            reply(request.id, JSON.parse(wasm.search(request.handle, request.query, request.options ? JSON.stringify(request.options) : null))),
          );
          break;
        case "close":
          guarded(request.id, () => {
            wasm.close(request.handle);
            reply(request.id, undefined);
          });
          break;
        case "cancel": {
          // Entries are removed by handleOpen's finally; a cancel landing
          // after completion leaves a (tiny) tombstone until then.
          cancelled.add(request.targetId);
          downloads.get(request.targetId)?.abort();
          reply(request.id, undefined);
          break;
        }
        default: {
          // Unknown op: answer instead of leaving the caller hanging.
          const unknown = request as { id?: number };
          if (typeof unknown.id === "number") {
            replyError(unknown.id, { code: "INTERNAL", detail: "unknown request op" });
          }
          break;
        }
      }
    },
    /** Test hook: live wasm handles (leak assertions). */
    openHandleCount(): number {
      return wasm.open_handle_count();
    },
  };
}
