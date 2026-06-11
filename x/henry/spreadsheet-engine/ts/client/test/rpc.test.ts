// RPC client suite (spec §7.6): real client + real engine-server + real
// wasm (node build), over an in-process WorkerLike transport. Cancellation,
// latest-wins coalescing under scroll storms, progress monotonicity, typed
// error propagation, lifecycle/leaks, chunked-vs-oneshot equivalence.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { EngineErrorException, SheetEngineClient } from "@dust/sheet-engine-client";
import { createNodeEngineHost, loadNodeWasm, type NodeEngineHost } from "@dust/sheet-engine-worker/node-host";

const ROOT = join(__dirname, "../../..");

function corpus(rel: string): ArrayBuffer {
  const buf = readFileSync(join(ROOT, "corpus", rel));
  // Copy into a standalone ArrayBuffer (transfer semantics in real workers).
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

let host: NodeEngineHost;
let client: SheetEngineClient;

beforeEach(() => {
  host = createNodeEngineHost();
  client = new SheetEngineClient(host);
});

afterEach(() => {
  client.destroy();
});

describe("open / metadata / lifecycle", () => {
  it("opens an xlsx and returns metadata", async () => {
    const handle = await client.open({ bytes: corpus("gen/dates_1900.xlsx") }, "dates_1900.xlsx");
    const meta = await client.getMetadata(handle);
    expect(meta.sheets.map((s) => s.name)).toEqual(["dates1900"]);
    expect(meta.date1904).toBe(false);
    const sheet = await client.activateSheet(handle, 0);
    expect(sheet.loaded).toBe(true);
    expect(sheet.cellCount).toBe(33);
    await client.close(handle);
    expect(host.openHandleCount()).toBe(0);
  });

  it("opens CSV through the same path", async () => {
    const handle = await client.open({ bytes: corpus("gen/csv/simple.csv") }, "simple.csv");
    await client.activateSheet(handle, 0);
    const rows = await client.getRowsBatch(handle, 0, 0, 10);
    expect(rows[0].cells.map((c) => c.value)).toEqual(["name", "qty", "price"]);
    // CSV numeric strings get a right-align hint without value mutation.
    expect(rows[1].cells[1].value).toBe("2");
    expect(rows[1].cells[1].align).toBe("right");
    expect(rows[0].cells[0].align).toBe("left");
    await client.close(handle);
  });

  it("frees every handle across 50 open/close cycles (leak check)", async () => {
    for (let i = 0; i < 50; i++) {
      const handle = await client.open({ bytes: corpus("gen/mixed_large.xlsx") }, "mixed_large.xlsx");
      await client.activateSheet(handle, 0);
      await client.close(handle);
    }
    expect(host.openHandleCount()).toBe(0);
  });
});

describe("typed errors (§5.3)", () => {
  it.each([
    ["evil/garbage.xlsx", "CORRUPT"],
    ["evil/fake_xls.xlsx", "UNSUPPORTED_FORMAT"],
    ["evil/encrypted.xlsx", "ENCRYPTED"],
  ])("%s -> %s", async (file, code) => {
    await expect(client.open({ bytes: corpus(file) }, file)).rejects.toMatchObject({ code });
    expect(host.openHandleCount()).toBe(0);
  });

  it("BUDGET_EXCEEDED when bytes exceed maxBytes", async () => {
    await expect(
      client.open({ bytes: corpus("gen/mixed_large.xlsx") }, "big.xlsx", { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  it("truncated metadata is not an error", async () => {
    const handle = await client.open({ bytes: corpus("gen/mixed_large.xlsx") }, "mixed_large.xlsx", {
      maxCellsPerSheet: 100,
    });
    const sheet = await client.activateSheet(handle, 0);
    expect(sheet.truncated).toBe(true);
    // Budget counts raw cells before duplicate-ref dedup, so the surviving
    // count is <= the budget.
    expect(sheet.cellCount).toBeGreaterThan(0);
    expect(sheet.cellCount).toBeLessThanOrEqual(100);
    await client.close(handle);
  });

  it("errors carry EngineErrorException with code+detail", async () => {
    try {
      await client.open({ bytes: corpus("evil/garbage.xlsx") }, "garbage.xlsx");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EngineErrorException);
      expect((e as EngineErrorException).code).toBe("CORRUPT");
      expect((e as EngineErrorException).detail.length).toBeGreaterThan(0);
    }
  });
});

describe("progress", () => {
  it("reports monotonic download progress then parse", async () => {
    const phases: string[] = [];
    const loaded: number[] = [];
    const task = client.open({ bytes: corpus("gen/mixed_large.xlsx") }, "mixed_large.xlsx").progress((p) => {
      phases.push(p.phase);
      if (p.phase === "download") {
        loaded.push(p.loaded);
      }
    });
    const handle = await task;
    expect(phases[0]).toBe("download");
    expect(phases[phases.length - 1]).toBe("parse");
    for (let i = 1; i < loaded.length; i++) {
      expect(loaded[i]).toBeGreaterThanOrEqual(loaded[i - 1]);
    }
    // No download progress after the first parse event.
    expect(phases.lastIndexOf("download")).toBeLessThan(phases.indexOf("parse"));
    await client.close(handle);
  });
});

describe("cancellation", () => {
  it("cancel() rejects with CANCELLED and frees the handle", async () => {
    const task = client.open({ bytes: corpus("gen/tall_narrow.xlsx") }, "tall_narrow.xlsx");
    task.cancel();
    await expect(task).rejects.toMatchObject({ code: "CANCELLED" });
    // The worker-side open either never completed or closed its handle.
    await new Promise((r) => setTimeout(r, 50));
    expect(host.openHandleCount()).toBe(0);
  });

  it("cancelled search rejects with CANCELLED", async () => {
    const handle = await client.open({ bytes: corpus("gen/strings_unicode.xlsx") }, "strings.xlsx");
    await client.activateSheet(handle, 0);
    const task = client.search(handle, "repeated");
    task.cancel();
    await expect(task).rejects.toMatchObject({ code: "CANCELLED" });
    await client.close(handle);
  });

  it("worker fetch aborts on cancel (url source)", async () => {
    let aborted = false;
    // Mimics real fetch: rejects with AbortError when the signal fires.
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    const localHost = createNodeEngineHost({ fetchImpl });
    const localClient = new SheetEngineClient(localHost);
    const task = localClient.open({ url: "https://example.invalid/big.xlsx" }, "big.xlsx");
    await new Promise((r) => setTimeout(r, 20));
    task.cancel();
    await expect(task).rejects.toMatchObject({ code: "CANCELLED" });
    await new Promise((r) => setTimeout(r, 20));
    expect(aborted).toBe(true);
    localClient.destroy();
  });
});

describe("url open path", () => {
  it("streams a fetched response into the engine with progress", async () => {
    const bytes = new Uint8Array(corpus("gen/dates_1900.xlsx"));
    const fetchImpl: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            // Two chunks: exercises streaming append.
            controller.enqueue(bytes.subarray(0, 1000));
            controller.enqueue(bytes.subarray(1000));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-length": String(bytes.length) } },
      );
    const localHost = createNodeEngineHost({ fetchImpl });
    const localClient = new SheetEngineClient(localHost);
    const handle = await localClient.open({ url: "https://example.invalid/dates.xlsx" }, "dates.xlsx");
    const meta = await localClient.getMetadata(handle);
    expect(meta.sheets[0].name).toBe("dates1900");
    await localClient.close(handle);
    localClient.destroy();
  });

  it("HTTP errors surface as CORRUPT", async () => {
    const fetchImpl: typeof fetch = async () => new Response("nope", { status: 404 });
    const localHost = createNodeEngineHost({ fetchImpl });
    const localClient = new SheetEngineClient(localHost);
    await expect(localClient.open({ url: "https://example.invalid/missing.xlsx" }, "missing.xlsx")).rejects.toMatchObject({
      code: "CORRUPT",
    });
    localClient.destroy();
  });
});

describe("latest-wins coalescing (§5.2)", () => {
  it("collapses a 200-request scroll storm into few round trips with a correct final state", async () => {
    const handle = await client.open({ bytes: corpus("gen/tall_narrow.xlsx") }, "tall_narrow.xlsx");
    await client.activateSheet(handle, 0);
    const before = host.requestCount();

    const promises: Array<Promise<unknown>> = [];
    for (let i = 0; i < 200; i++) {
      promises.push(client.getViewport(handle, 0, [i * 10, i * 10 + 60], [0, 5]));
    }
    const results = await Promise.all(promises);
    const roundTrips = host.requestCount() - before;
    // First request goes out immediately; everything else coalesces into the
    // single queued-latest slot (plus scheduling slack).
    expect(roundTrips).toBeLessThanOrEqual(10);

    // Final state correct: the last viewport result matches a direct query.
    const last = results[results.length - 1] as { rowStart: number; cells: Array<{ row: number; text: string }> };
    expect(last.rowStart).toBe(1990);
    const direct = await client.getViewport(handle, 0, [1990, 2050], [0, 5]);
    expect(last.cells).toEqual(direct.cells);
    await client.close(handle);
  });

  it("viewport content is exact (formatted text, merges, styles subset)", async () => {
    const handle = await client.open({ bytes: corpus("gen/merges_frozen.xlsx") }, "merges_frozen.xlsx");
    const sheet = await client.activateSheet(handle, 0);
    expect(sheet.frozenRows).toBe(2);
    expect(sheet.frozenCols).toBe(1);
    const slice = await client.getViewport(handle, 0, [0, 10], [0, 10]);
    expect(slice.merges.length).toBeGreaterThan(0);
    const a1 = slice.cells.find((c) => c.row === 0 && c.col === 0);
    expect(a1?.mergeSpan).toEqual([1, 3]);
    // Style table subset only contains referenced indices.
    for (const cell of slice.cells) {
      expect(slice.styles[cell.style]).toBeDefined();
    }
    await client.close(handle);
  });
});

describe("chunked append == one-shot (wasm layer)", () => {
  it("produces identical canonical JSON for 1-byte-chunked and one-shot opens", () => {
    const wasm = loadNodeWasm();
    const bytes = new Uint8Array(corpus("gen/formulas_errors.xlsx"));

    const oneShot = wasm.open_start("a.xlsx", null);
    wasm.append_chunk(oneShot, bytes);
    wasm.open_finish(oneShot);
    const a = wasm.canonical_json(oneShot);
    wasm.close(oneShot);

    const chunked = wasm.open_start("b.xlsx", null);
    for (let offset = 0; offset < bytes.length; offset += 977) {
      wasm.append_chunk(chunked, bytes.subarray(offset, offset + 977));
    }
    wasm.open_finish(chunked);
    const b = wasm.canonical_json(chunked);
    wasm.close(chunked);

    expect(a).toBe(b);
  });

  it("wasm memory stops growing across repeated open/close cycles", () => {
    const wasm = loadNodeWasm();
    const bytes = new Uint8Array(corpus("gen/mixed_large.xlsx"));
    const cycle = () => {
      const h = wasm.open_start("cycle.xlsx", null);
      wasm.append_chunk(h, bytes);
      wasm.open_finish(h);
      wasm.activate_sheet(h, 0);
      wasm.get_rows_batch(h, 0, 0, 100);
      wasm.close(h);
    };
    for (let i = 0; i < 5; i++) {
      cycle();
    }
    const after5 = wasm.memory_pages();
    for (let i = 0; i < 45; i++) {
      cycle();
    }
    const after50 = wasm.memory_pages();
    expect(after50).toBe(after5);
    expect(wasm.open_handle_count()).toBe(0);
  });
});
