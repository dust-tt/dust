// Wasm size gate (spec §4): warn above 1.5 MB gzipped, hard-fail above 2 MB.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = join(root, "ts/worker/wasm/web/engine_bg.wasm");

const raw = readFileSync(wasmPath);
const gzipped = gzipSync(raw, { level: 9 }).length;

const WARN_BYTES = 1.5 * 1024 * 1024;
const FAIL_BYTES = 2 * 1024 * 1024;

console.log(
  `engine_bg.wasm: ${(raw.length / 1024).toFixed(0)} KiB raw, ${(gzipped / 1024).toFixed(0)} KiB gzipped ` +
    `(warn ${(WARN_BYTES / 1024).toFixed(0)} KiB, fail ${(FAIL_BYTES / 1024).toFixed(0)} KiB)`,
);

if (gzipped > FAIL_BYTES) {
  console.error("FAIL: wasm exceeds the 2 MB gzipped hard gate");
  process.exit(1);
}
if (gzipped > WARN_BYTES) {
  console.warn("WARN: wasm exceeds the 1.5 MB gzipped budget");
}
