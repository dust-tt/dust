// Engine-server failure-path suite: trap poisoning (the server's headline
// safety feature), unknown-op handling, and client lifecycle edges that the
// happy-path RPC suite doesn't reach.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { SheetEngineClient } from "@dust/sheet-engine-client";
import type { EngineResponse } from "@dust/sheet-engine-client/protocol";
import { createEngineServer, type EngineWasm } from "@dust/sheet-engine-worker/engine-server";
import { createNodeEngineHost, loadNodeWasm } from "@dust/sheet-engine-worker/node-host";

const ROOT = join(__dirname, "../../..");

function corpus(rel: string): ArrayBuffer {
  const buf = readFileSync(join(ROOT, "corpus", rel));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/** Real wasm with one method overridden to trap like a Rust panic would. */
function trappingWasm(): EngineWasm {
  const real = loadNodeWasm();
  return {
    ...real,
    get_rows_batch: () => {
      const e = new Error("unreachable executed");
      e.name = "RuntimeError";
      throw e;
    },
  };
}

describe("trap poisoning", () => {
  it("maps a wasm trap to INTERNAL and poisons every later call", async () => {
    const responses: EngineResponse[] = [];
    const server = createEngineServer({ wasm: trappingWasm(), post: (r) => responses.push(r) });

    const bytes = new Uint8Array(corpus("gen/single_cell.xlsx"));
    server.handle({ id: 1, op: "open", fileName: "a.xlsx", bytes: bytes.buffer as ArrayBuffer });
    await new Promise((r) => setTimeout(r, 20));
    const opened = responses.find((r) => r.id === 1 && r.kind === "ok");
    expect(opened).toBeDefined();
    const handle = (opened as { result: { handle: number } }).result.handle;

    // The trap itself: INTERNAL with a recreate hint.
    server.handle({ id: 2, op: "rowsBatch", handle, sheet: 0, startRow: 0, rowCount: 10 });
    await new Promise((r) => setTimeout(r, 5));
    const trapped = responses.find((r) => r.id === 2);
    expect(trapped).toMatchObject({ kind: "error", error: { code: "INTERNAL" } });
    expect((trapped as { error: { detail: string } }).error.detail).toContain("recreated");

    // Linear memory may be corrupt: even untouched endpoints answer INTERNAL.
    server.handle({ id: 3, op: "metadata", handle });
    await new Promise((r) => setTimeout(r, 5));
    expect(responses.find((r) => r.id === 3)).toMatchObject({ kind: "error", error: { code: "INTERNAL" } });
  });

  it("an ordinary JS error mentioning 'unreachable' does not poison", async () => {
    const real = loadNodeWasm();
    const wasm: EngineWasm = {
      ...real,
      get_styles: () => {
        throw new Error("this branch should be unreachable");
      },
    };
    const responses: EngineResponse[] = [];
    const server = createEngineServer({ wasm, post: (r) => responses.push(r) });
    const bytes = new Uint8Array(corpus("gen/single_cell.xlsx"));
    server.handle({ id: 1, op: "open", fileName: "a.xlsx", bytes: bytes.buffer as ArrayBuffer });
    await new Promise((r) => setTimeout(r, 20));
    const handle = (responses.find((r) => r.id === 1 && r.kind === "ok") as { result: { handle: number } }).result
      .handle;

    server.handle({ id: 2, op: "styles", handle });
    await new Promise((r) => setTimeout(r, 5));
    expect(responses.find((r) => r.id === 2)).toMatchObject({ kind: "error", error: { code: "INTERNAL" } });

    // Not poisoned: the next call still succeeds.
    server.handle({ id: 3, op: "metadata", handle });
    await new Promise((r) => setTimeout(r, 5));
    expect(responses.find((r) => r.id === 3)).toMatchObject({ kind: "ok" });
    server.handle({ id: 4, op: "close", handle });
  });
});

describe("protocol edges", () => {
  it("unknown ops answer INTERNAL instead of hanging", async () => {
    const responses: EngineResponse[] = [];
    const server = createEngineServer({ wasm: loadNodeWasm(), post: (r) => responses.push(r) });
    server.handle({ id: 7, op: "frobnicate" } as never);
    await new Promise((r) => setTimeout(r, 5));
    expect(responses.find((r) => r.id === 7)).toMatchObject({ kind: "error", error: { code: "INTERNAL" } });
  });

  it("close is idempotent (double close does not error)", async () => {
    const host = createNodeEngineHost();
    const client = new SheetEngineClient(host);
    const handle = await client.open({ bytes: corpus("gen/single_cell.xlsx") }, "a.xlsx");
    await client.close(handle);
    await expect(client.close(handle)).resolves.toBeUndefined();
    client.destroy();
  });

  it("destroy() rejects in-flight calls with CANCELLED", async () => {
    const host = createNodeEngineHost();
    const client = new SheetEngineClient(host);
    const pending = client.open({ bytes: corpus("gen/mixed_large.xlsx") }, "big.xlsx");
    client.destroy();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  });
});

describe("url open guards", () => {
  it("rejects before downloading when content-length exceeds the budget", async () => {
    let bodyTouched = false;
    const fetchImpl: typeof fetch = async () => {
      const response = new Response(null, {
        status: 200,
        headers: { "content-length": String(500 * 1024 * 1024 * 1024) },
      });
      // Any attempt to read the payload (body stream OR buffered fallback)
      // trips the flag; the budget check must fire before either.
      Object.defineProperty(response, "body", {
        get() {
          bodyTouched = true;
          return null;
        },
      });
      response.arrayBuffer = async () => {
        bodyTouched = true;
        return new ArrayBuffer(0);
      };
      return response;
    };
    const host = createNodeEngineHost({ fetchImpl });
    const client = new SheetEngineClient(host);
    await expect(client.open({ url: "https://example.invalid/huge.xlsx" }, "huge.xlsx")).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    expect(bodyTouched).toBe(false);
    client.destroy();
  });

  it("default budget boundary pins the engine-core default (400 MB)", async () => {
    // Just above the mirrored default rejects pre-download; exactly at it
    // passes the check and proceeds to download/parse (CORRUPT here because
    // the stub serves no bytes). Catches silent drift between
    // DEFAULT_MAX_BYTES and OpenOptions::default().max_bytes.
    const stub = (contentLength: number): typeof fetch => async () => {
      const response = new Response(null, {
        status: 200,
        headers: { "content-length": String(contentLength) },
      });
      Object.defineProperty(response, "body", { value: null });
      response.arrayBuffer = async () => new ArrayBuffer(0);
      return response;
    };
    const defaultMaxBytes = 400 * 1024 * 1024;

    const over = new SheetEngineClient(createNodeEngineHost({ fetchImpl: stub(defaultMaxBytes + 1) }));
    await expect(over.open({ url: "https://example.invalid/f.xlsx" }, "f.xlsx")).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    over.destroy();

    const at = new SheetEngineClient(createNodeEngineHost({ fetchImpl: stub(defaultMaxBytes) }));
    await expect(at.open({ url: "https://example.invalid/f.xlsx" }, "f.xlsx")).rejects.toMatchObject({
      code: "CORRUPT",
    });
    at.destroy();
  });

  it("content-length checks against an explicit maxBytes override", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(new ReadableStream({ pull() {} }), {
        status: 200,
        headers: { "content-length": String(2048) },
      });
    const host = createNodeEngineHost({ fetchImpl });
    const client = new SheetEngineClient(host);
    await expect(
      client.open({ url: "https://example.invalid/f.xlsx" }, "f.xlsx", { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    client.destroy();
  });

  it("falls back to arrayBuffer() when the response has no body stream", async () => {
    const bytes = new Uint8Array(corpus("gen/single_cell.xlsx"));
    const fetchImpl: typeof fetch = async () => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "body", { value: null });
      response.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return response;
    };
    const host = createNodeEngineHost({ fetchImpl });
    const client = new SheetEngineClient(host);
    const handle = await client.open({ url: "https://example.invalid/s.xlsx" }, "s.xlsx");
    const meta = await client.getMetadata(handle);
    expect(meta.sheets[0].name).toBe("single");
    await client.close(handle);
    client.destroy();
  });
});

describe("FinalizationRegistry backstop", () => {
  it("closes leaked handles and warns (requires --expose-gc)", async () => {
    const gc = (globalThis as { gc?: () => void }).gc;
    if (typeof gc !== "function") {
      // Without --expose-gc the registry cannot be forced deterministically.
      console.warn("[test] skipping FinalizationRegistry backstop: run node with --expose-gc");
      return;
    }
    const host = createNodeEngineHost();
    const client = new SheetEngineClient(host);
    const baseline = host.openHandleCount();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Leak a handle inside a scope that drops every reference to it.
    await (async () => {
      await client.open({ bytes: corpus("gen/single_cell.xlsx") }, "leak.xlsx");
    })();
    expect(host.openHandleCount()).toBe(baseline + 1);

    for (let i = 0; i < 20 && host.openHandleCount() > baseline; i++) {
      gc();
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(host.openHandleCount()).toBe(baseline);
    expect(
      warnSpy.mock.calls.some((args) => String(args[0]).includes("leaked")),
    ).toBe(true);
    warnSpy.mockRestore();
    client.destroy();
  });
});
