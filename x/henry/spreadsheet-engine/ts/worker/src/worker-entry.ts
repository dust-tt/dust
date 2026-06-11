// Browser worker entry: load the web wasm build, wire the server to
// self.postMessage. Bundlers consume this via
// `new Worker(new URL("./worker-entry", import.meta.url), { type: "module" })`.

import type { EngineRequest } from "@dust/sheet-engine-client/protocol";

import init, * as wasm from "../wasm/web/engine.js";
import { createEngineServer, type EngineWasm } from "./engine-server";

const ready = init().then(() =>
  createEngineServer({
    wasm: wasm as unknown as EngineWasm,
    post: (response) => {
      (self as unknown as { postMessage: (m: unknown) => void }).postMessage(response);
    },
  }),
);

self.addEventListener("message", (event) => {
  void ready.then((server) => server.handle((event as MessageEvent).data as EngineRequest));
});
