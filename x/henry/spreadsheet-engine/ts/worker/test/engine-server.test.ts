// Engine-server failure-path suite: trap poisoning (the server's headline
// safety feature), unknown-op handling, and client lifecycle edges that the
// happy-path RPC suite doesn't reach.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
