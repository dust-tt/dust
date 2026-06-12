// Node test host: runs the REAL engine-server against the nodejs wasm build,
// exposed through the same WorkerLike surface the browser worker presents.
// vitest suites talk to it exactly like production code talks to the worker —
// same protocol, same server module, different transport.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { EngineRequest, EngineResponse, WorkerLike } from "@dust/sheet-engine-client/protocol";

import { createEngineServer, type EngineWasm } from "./engine-server";

const require = createRequire(import.meta.url);

export function loadNodeWasm(): EngineWasm {
  const wasmDir = join(dirname(fileURLToPath(import.meta.url)), "../wasm/node");
  return require(join(wasmDir, "engine.js")) as EngineWasm;
}

export interface NodeEngineHost extends WorkerLike {
  /** Live wasm handles (leak assertions). */
  openHandleCount(): number;
  /** Messages delivered to the server (round-trip assertions). */
  requestCount(): number;
}

/** In-process WorkerLike running the real server + real wasm. Message delivery
 * is deferred a microtask to mimic postMessage async semantics. */
export function createNodeEngineHost(options?: { fetchImpl?: typeof fetch }): NodeEngineHost {
  const wasm = loadNodeWasm();
  const listeners = new Set<(event: { data: unknown }) => void>();
  let terminated = false;
  let requests = 0;

  const server = createEngineServer({
    wasm,
    fetchImpl: options?.fetchImpl,
    post: (response: EngineResponse) => {
      if (terminated) {
        return;
      }
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener({ data: response });
        }
      });
    },
  });

  return {
    postMessage(message: unknown) {
      if (terminated) {
        return;
      }
      requests += 1;
      queueMicrotask(() => server.handle(message as EngineRequest));
    },
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    terminate() {
      terminated = true;
      listeners.clear();
    },
    openHandleCount: () => server.openHandleCount(),
    requestCount: () => requests,
  };
}
