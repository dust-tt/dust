// @dust/sheet-engine-client: async RPC over postMessage to the engine
// worker. Core invariant: nothing O(workbook) ever crosses this
// boundary — metadata, viewport slices and capped search results only.

import type { EngineRequest, EngineResponse, WorkerLike } from "./protocol";
import {
  type BatchRow,
  type DisplayMode,
  EngineErrorException,
  type EngineError,
  isEngineError,
  type OpenOptions,
  type Progress,
  type ResolvedStyle,
  type SearchOpts,
  type SearchResults,
  type SheetGeometry,
  type SheetMeta,
  type Task,
  type ViewportSlice,
  type WorkbookHandle,
  type WorkbookMeta,
} from "./types";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onProgress?: (p: Progress) => void;
}

function makeTask<T>(promise: Promise<T>, hooks: { onProgressCb: (cb: (p: Progress) => void) => void; onCancel: () => void }): Task<T> {
  const task = promise as Task<T>;
  task.progress = (cb) => {
    hooks.onProgressCb(cb);
    return task;
  };
  task.cancel = hooks.onCancel;
  return task;
}

const CANCELLED: EngineError = { code: "CANCELLED", detail: "" };

/** Key for latest-wins coalescing: one in-flight pull per (handle, sheet, kind). */
function coalesceKey(kind: string, handle: number, sheet: number): string {
  return `${kind}:${handle}:${sheet}`;
}

export class SheetEngineClient {
  private worker: WorkerLike;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private closed = false;
  /**
   * Latest-wins coalescing: at most one in-flight viewport /
   * rows-batch request per (handle, sheet). A burst of scroll requests
   * collapses to the in-flight one plus the single latest queued one; all
   * superseded callers share the latest result, so fast scrolling can never
   * build a worker backlog.
   */
  private inflight = new Map<string, Promise<unknown>>();
  private queuedLatest = new Map<
    string,
    { request: EngineRequest; resolvers: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> }
  >();
  /** Backstop for forgotten close() — fires a console warning. */
  private registry: FinalizationRegistry<number> | null;
  private listener: (event: { data: unknown }) => void;

  constructor(worker: WorkerLike) {
    this.worker = worker;
    this.listener = (event) => this.onMessage(event.data);
    this.worker.addEventListener("message", this.listener);
    this.registry =
      typeof FinalizationRegistry === "undefined"
        ? null
        : new FinalizationRegistry((handleId) => {
            if (this.closed) {
              return; // worker gone; nothing left to leak
            }
            // Reaching here means an explicit close() was missed.
            console.warn(`[sheet-engine] workbook handle ${handleId} leaked; closing via FinalizationRegistry backstop`);
            this.send({ id: this.allocId(), op: "close", handle: handleId });
          });
  }

  private allocId(): number {
    return this.nextId++;
  }

  private send(request: EngineRequest, transfer?: Transferable[]): void {
    this.worker.postMessage(request, transfer);
  }

  private onMessage(data: unknown): void {
    const response = data as EngineResponse;
    if (typeof response !== "object" || response === null || typeof response.id !== "number") {
      return;
    }
    const entry = this.pending.get(response.id);
    if (!entry) {
      return;
    }
    switch (response.kind) {
      case "progress":
        entry.onProgress?.(response.progress);
        break;
      case "ok":
        this.pending.delete(response.id);
        entry.resolve(response.result);
        break;
      case "error":
        this.pending.delete(response.id);
        entry.reject(
          new EngineErrorException(
            isEngineError(response.error) ? response.error : { code: "INTERNAL", detail: "malformed error" },
          ),
        );
        break;
      default: {
        // Type-level the union is exhaustive; at runtime a malformed kind
        // must fail loudly rather than hang the caller.
        const id = (response as { id: number }).id;
        this.pending.delete(id);
        entry.reject(new EngineErrorException({ code: "INTERNAL", detail: "malformed response from worker" }));
        break;
      }
    }
  }

  private call<T>(request: EngineRequest, transfer?: Transferable[], onProgress?: (p: Progress) => void): Promise<T> {
    if (this.closed) {
      return Promise.reject(new EngineErrorException({ code: "INTERNAL", detail: "client destroyed" }));
    }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(request.id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      try {
        this.send(request, transfer);
      } catch (e) {
        // postMessage can throw synchronously (DataCloneError, detached
        // buffer); the pending entry must not leak.
        this.pending.delete(request.id);
        reject(new EngineErrorException({ code: "INTERNAL", detail: `postMessage failed: ${String(e)}` }));
      }
    });
  }

  /** Coalesced pull: returns the result of the LATEST request once the line
   * is free. NOTE: superseded callers resolve with the latest caller's range,
   * not their own — by design (scroll always wants the newest window), but
   * callers must not assume their exact range was fetched. */
  private coalescedCall<T>(key: string, makeRequest: () => EngineRequest): Promise<T> {
    if (this.inflight.has(key)) {
      // Replace any previously queued request; superseded callers ride along.
      let entry = this.queuedLatest.get(key);
      if (entry) {
        entry.request = makeRequest();
      } else {
        entry = { request: makeRequest(), resolvers: [] };
        this.queuedLatest.set(key, entry);
      }
      return new Promise<T>((resolve, reject) => {
        entry.resolvers.push({ resolve: resolve as (v: unknown) => void, reject });
      });
    }
    const run = (request: EngineRequest): Promise<unknown> => {
      const p = this.call<unknown>(request).then(
        (result) => {
          settle(result, null);
          return result;
        },
        (error) => {
          settle(null, error);
          throw error;
        },
      );
      this.inflight.set(key, p);
      return p;
    };
    const settle = (result: unknown, error: unknown) => {
      this.inflight.delete(key);
      const next = this.queuedLatest.get(key);
      if (next) {
        this.queuedLatest.delete(key);
        run(next.request).then(
          (value) => {
            for (const r of next.resolvers) {
              r.resolve(value);
            }
          },
          (err) => {
            for (const r of next.resolvers) {
              r.reject(err);
            }
          },
        );
      }
      void result;
      void error;
    };
    return run(makeRequest()) as Promise<T>;
  }

  /**
   * Open from a URL (worker fetches + streams) or transferred bytes.
   *
   * SSRF boundary: with `{ url }` the worker fetches whatever URL the main
   * thread provides — the engine cannot meaningfully allowlist, and CORS is
   * the only browser-level control. Validating/allowlisting URLs is the
   * embedder's responsibility; prefer `{ bytes }` when the file is already
   * in hand.
   */
  open(src: { url: string } | { bytes: ArrayBuffer }, fileName: string, options?: OpenOptions): Task<WorkbookHandle> {
    const id = this.allocId();
    const progressCbs: Array<(p: Progress) => void> = [];
    let cancelled = false;

    const promise = this.call<{ handle: number; meta: WorkbookMeta }>(
      {
        id,
        op: "open",
        fileName,
        options,
        ...("url" in src ? { url: src.url } : { bytes: src.bytes }),
      },
      "bytes" in src ? [src.bytes] : undefined,
      (p) => {
        for (const cb of progressCbs) {
          cb(p);
        }
      },
    ).then(({ handle, meta }) => {
      if (cancelled) {
        this.send({ id: this.allocId(), op: "close", handle });
        throw new EngineErrorException(CANCELLED);
      }
      const wrapped: WorkbookHandle & { meta: WorkbookMeta } = { id: handle, meta };
      this.registry?.register(wrapped, handle, wrapped);
      return wrapped;
    });

    return makeTask(promise, {
      onProgressCb: (cb) => progressCbs.push(cb),
      onCancel: () => {
        // Settlement stays with the worker response so the handle can never
        // leak: if the open already succeeded worker-side, the continuation
        // above sees `cancelled`, closes the handle and rejects CANCELLED;
        // if it is mid-download, the worker aborts and rejects CANCELLED.
        // Parse is synchronous inside wasm, so cancellation takes effect at
        // chunk boundaries; a truly stuck worker is reclaimed by destroy().
        cancelled = true;
        this.send({ id: this.allocId(), op: "cancel", targetId: id });
      },
    });
  }

  getMetadata(handle: WorkbookHandle): Promise<WorkbookMeta> {
    return this.call<WorkbookMeta>({ id: this.allocId(), op: "metadata", handle: handle.id });
  }

  activateSheet(handle: WorkbookHandle, sheet: number): Promise<SheetMeta> {
    return this.call<SheetMeta>({ id: this.allocId(), op: "activateSheet", handle: handle.id, sheet });
  }

  getViewport(
    handle: WorkbookHandle,
    sheet: number,
    rows: [number, number],
    cols: [number, number],
    mode: DisplayMode = "value",
  ): Promise<ViewportSlice> {
    return this.coalescedCall<ViewportSlice>(coalesceKey("viewport", handle.id, sheet), () => ({
      id: this.allocId(),
      op: "viewport",
      handle: handle.id,
      sheet,
      rows,
      cols,
      mode,
    }));
  }

  getRowsBatch(handle: WorkbookHandle, sheet: number, startRow: number, rowCount: number): Promise<BatchRow[]> {
    return this.coalescedCall<BatchRow[]>(coalesceKey("rowsBatch", handle.id, sheet), () => ({
      id: this.allocId(),
      op: "rowsBatch",
      handle: handle.id,
      sheet,
      startRow,
      rowCount,
    }));
  }

  getStyles(handle: WorkbookHandle): Promise<ResolvedStyle[]> {
    return this.call<ResolvedStyle[]>({ id: this.allocId(), op: "styles", handle: handle.id });
  }

  getSheetGeometry(handle: WorkbookHandle, sheet: number): Promise<SheetGeometry> {
    return this.call<SheetGeometry>({ id: this.allocId(), op: "geometry", handle: handle.id, sheet });
  }

  search(handle: WorkbookHandle, query: string, options?: SearchOpts): Task<SearchResults> {
    const id = this.allocId();
    let cancelled = false;
    const promise = this.call<SearchResults>({ id, op: "search", handle: handle.id, query, options }).then((r) => {
      if (cancelled) {
        throw new EngineErrorException(CANCELLED);
      }
      return r;
    });
    return makeTask(promise, {
      onProgressCb: () => {},
      onCancel: () => {
        // Client-local cancellation only: the wasm scan is synchronous, so
        // the worker cannot be interrupted mid-search (unlike open(), whose
        // download aborts). The reply for this id is simply dropped.
        cancelled = true;
        const entry = this.pending.get(id);
        if (entry) {
          this.pending.delete(id);
          entry.reject(new EngineErrorException(CANCELLED));
        }
      },
    });
  }

  async close(handle: WorkbookHandle): Promise<void> {
    this.registry?.unregister(handle);
    await this.call<void>({ id: this.allocId(), op: "close", handle: handle.id });
  }

  /** Terminate the worker. Outstanding calls — in-flight AND queued-but-not-
   * sent coalesced callers — reject with CANCELLED. */
  destroy(): void {
    this.closed = true;
    for (const [id, entry] of this.pending) {
      this.pending.delete(id);
      entry.reject(new EngineErrorException(CANCELLED));
    }
    // Queued coalesced callers never reached `pending`; without this drain
    // they would settle through the in-flight rejection's re-run path with a
    // misleading INTERNAL "client destroyed" instead of CANCELLED.
    for (const [key, entry] of this.queuedLatest) {
      this.queuedLatest.delete(key);
      for (const r of entry.resolvers) {
        r.reject(new EngineErrorException(CANCELLED));
      }
    }
    this.inflight.clear();
    this.worker.removeEventListener("message", this.listener);
    this.worker.terminate();
  }
}
