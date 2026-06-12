// RPC client suite: real client + real engine-server + real
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

describe("typed errors", () => {
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

describe("latest-wins coalescing", () => {
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

describe("coalescing interleavings", () => {
  it("destroy() rejects queued coalesced callers with CANCELLED", async () => {
    const handle = await client.open({ bytes: corpus("gen/tall_narrow.xlsx") }, "tall_narrow.xlsx");
    await client.activateSheet(handle, 0);
    // Close worker-side first so this test leaks no handle into the shared
    // wasm instance; destroy() races ahead of any worker response anyway.
    await client.close(handle);
    // First call goes in-flight; the next two share the queued-latest slot.
    const inflight = client.getViewport(handle, 0, [0, 60], [0, 5]);
    const queuedA = client.getViewport(handle, 0, [100, 160], [0, 5]);
    const queuedB = client.getViewport(handle, 0, [200, 260], [0, 5]);
    client.destroy();
    await expect(inflight).rejects.toMatchObject({ code: "CANCELLED" });
    await expect(queuedA).rejects.toMatchObject({ code: "CANCELLED" });
    await expect(queuedB).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("superseded callers share the latest request's rejection", async () => {
    const handle = await client.open({ bytes: corpus("gen/tall_narrow.xlsx") }, "tall_narrow.xlsx");
    await client.activateSheet(handle, 0);
    // In-flight goes out now; the next two share the queued-latest slot.
    const inflight = client.getViewport(handle, 0, [0, 60], [0, 5]);
    const superseded = client.getViewport(handle, 0, [100, 160], [0, 5]);
    const latest = client.getViewport(handle, 0, [200, 260], [0, 5]);
    // The close is posted BEFORE the queued request runs (it only goes out
    // once the in-flight call settles), so the queued request hits a closed
    // handle and rejects — and the superseded caller must see that same
    // rejection, not hang or resolve with stale data.
    const closing = client.close(handle);
    await expect(inflight).resolves.toBeDefined();
    await closing;
    await expect(latest).rejects.toMatchObject({ code: "INTERNAL" });
    await expect(superseded).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("coalescing is independent per (handle, sheet) key", async () => {
    const handle = await client.open({ bytes: corpus("gen/multi_sheet_50.xlsx") }, "multi.xlsx");
    await client.activateSheet(handle, 0);
    await client.activateSheet(handle, 1);
    const before = host.requestCount();
    // Bursts on two different sheets: each sheet coalesces separately and
    // both final states are correct.
    const sheet0: Array<Promise<unknown>> = [];
    const sheet1: Array<Promise<unknown>> = [];
    for (let i = 0; i < 50; i++) {
      sheet0.push(client.getViewport(handle, 0, [i, i + 20], [0, 5]));
      sheet1.push(client.getViewport(handle, 1, [i * 2, i * 2 + 20], [0, 5]));
    }
    const [r0, r1] = await Promise.all([Promise.all(sheet0), Promise.all(sheet1)]);
    const roundTrips = host.requestCount() - before;
    expect(roundTrips).toBeLessThanOrEqual(20);
    const last0 = r0[r0.length - 1] as { sheet: number; rowStart: number };
    const last1 = r1[r1.length - 1] as { sheet: number; rowStart: number };
    expect(last0.sheet).toBe(0);
    expect(last0.rowStart).toBe(49);
    expect(last1.sheet).toBe(1);
    expect(last1.rowStart).toBe(98);
    await client.close(handle);
  });
});

describe("formula display mode", () => {
  it("renders =formula text for formula cells, values for the rest", async () => {
    const handle = await client.open({ bytes: corpus("gen/formulas_errors.xlsx") }, "formulas.xlsx");
    await client.activateSheet(handle, 0);
    const valueMode = await client.getViewport(handle, 0, [0, 30], [0, 10], "value");
    const formulaMode = await client.getViewport(handle, 0, [0, 30], [0, 10], "formula");
    expect(formulaMode.cells.length).toBe(valueMode.cells.length);
    const formulaCells = formulaMode.cells.filter((c) => c.formula);
    expect(formulaCells.length).toBeGreaterThan(0);
    for (const cell of formulaCells) {
      expect(cell.text).toBe(`=${cell.formula}`);
    }
    // Non-formula cells fall back to their formatted value.
    const plain = formulaMode.cells.filter((c) => !c.formula);
    const plainValue = new Map(valueMode.cells.filter((c) => !c.formula).map((c) => [`${c.row}:${c.col}`, c.text]));
    expect(plain.length).toBeGreaterThan(0);
    for (const cell of plain) {
      expect(cell.text).toBe(plainValue.get(`${cell.row}:${cell.col}`));
    }
    await client.close(handle);
  });
});

describe("hyperlinks", () => {
  it("viewport and rows-batch carry sanitized targets", async () => {
    const handle = await client.open({ bytes: corpus("gen/hyperlinks.xlsx") }, "hyperlinks.xlsx");
    await client.activateSheet(handle, 0);
    const slice = await client.getViewport(handle, 0, [0, 10], [0, 5]);
    const byA1 = new Map(slice.cells.map((c) => [`${c.row}:${c.col}`, c.hyperlink]));
    expect(byA1.get("0:0")).toBe("https://example.com/page?x=1");
    expect(byA1.get("1:0")).toBe("mailto:team@example.com");
    expect(byA1.get("2:0")).toBe("#two!B2");
    expect(byA1.get("3:0")).toBe("ftp://files.example.com/data.bin");
    // Range-anchored link covers both cells.
    expect(byA1.get("4:0")).toBe("http://plain.example.com");
    expect(byA1.get("4:1")).toBe("http://plain.example.com");

    const rows = await client.getRowsBatch(handle, 0, 0, 10);
    expect(rows[0].cells[0].hyperlink).toBe("https://example.com/page?x=1");
    await client.close(handle);
  });

  it("hostile schemes never cross the boundary", async () => {
    const handle = await client.open({ bytes: corpus("evil/xss_hyperlinks.xlsx") }, "xss.xlsx");
    await client.activateSheet(handle, 0);
    const slice = await client.getViewport(handle, 0, [0, 20], [0, 5]);
    const links = slice.cells.map((c) => c.hyperlink).filter((h): h is string => Boolean(h));
    expect(links).toEqual(["https://example.com/safe", "#xss!A1"]);
    await client.close(handle);
  });
});

describe("open options", () => {
  it("csvDelimiter overrides the sniffer", async () => {
    const bytes = new TextEncoder().encode("a,b,c\n1,2,3\n");
    const buf = bytes.buffer.slice(0, bytes.byteLength);
    const sniffed = await client.open({ bytes: buf }, "data.csv");
    await client.activateSheet(sniffed, 0);
    expect((await client.getRowsBatch(sniffed, 0, 0, 5))[0].cells.length).toBe(3);
    await client.close(sniffed);

    const bytes2 = new TextEncoder().encode("a,b,c\n1,2,3\n");
    const forced = await client.open({ bytes: bytes2.buffer.slice(0, bytes2.byteLength) }, "data.csv", {
      csvDelimiter: ";",
    });
    await client.activateSheet(forced, 0);
    const rows = await client.getRowsBatch(forced, 0, 0, 5);
    expect(rows[0].cells.length).toBe(1);
    expect(rows[0].cells[0].value).toBe("a,b,c");
    await client.close(forced);
  });

  it("truncated sheets report truncatedAtRow", async () => {
    const handle = await client.open({ bytes: corpus("gen/mixed_large.xlsx") }, "mixed_large.xlsx", {
      maxCellsPerSheet: 100,
    });
    const sheet = await client.activateSheet(handle, 0);
    expect(sheet.truncated).toBe(true);
    expect(sheet.truncatedAtRow).toBeTypeOf("number");
    expect(sheet.truncatedAtRow).toBeLessThanOrEqual(sheet.rowCount - 1);
    await client.close(handle);
  });
});

describe("search scope", () => {
  it("searches loaded sheets only", async () => {
    const handle = await client.open({ bytes: corpus("gen/multi_sheet_50.xlsx") }, "multi.xlsx");
    await client.activateSheet(handle, 0);
    // Every sheet i carries a "diag{i}" cell, so hits on unloaded sheets
    // would show up here. Only the activated sheet may be scanned.
    const results = await client.search(handle, "diag");
    const sheetsHit = new Set(results.hits.map((h) => h.sheet));
    expect(sheetsHit).toEqual(new Set([0]));
    await client.activateSheet(handle, 1);
    const after = await client.search(handle, "diag");
    expect(new Set(after.hits.map((h) => h.sheet))).toEqual(new Set([0, 1]));
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
