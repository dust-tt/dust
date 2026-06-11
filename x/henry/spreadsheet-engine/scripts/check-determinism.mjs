// Determinism gate (spec §7.1): for every corpus file, canonical JSON from
// (a) native engine-cli run twice and (b) the wasm build in Node must be
// byte-identical (hash compare). Cross-platform identity is covered by
// running this same script on CI Linux and dev macOS.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "target/release/engine-cli");
const require = createRequire(import.meta.url);

if (!existsSync(cli)) {
  console.error("engine-cli not built — run: cargo build -p engine-cli --release");
  process.exit(2);
}
const engine = require(join(root, "ts/worker/wasm/node/engine.js"));

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function nativeParse(path) {
  return execFileSync(cli, ["parse", path], { maxBuffer: 1 << 28 });
}

function wasmParse(path, name) {
  const handle = engine.open_start(name, null);
  try {
    engine.append_chunk(handle, readFileSync(path));
    engine.open_finish(handle);
    return Buffer.from(engine.canonical_json(handle), "utf8");
  } finally {
    engine.close(handle);
  }
}

const files = [
  ...readdirSync(join(root, "corpus/gen")).filter((f) => f.endsWith(".xlsx")).map((f) => `gen/${f}`),
  ...readdirSync(join(root, "corpus/gen/csv")).map((f) => `gen/csv/${f}`),
];

let failures = 0;
for (const rel of files) {
  const path = join(root, "corpus", rel);
  const a = sha(nativeParse(path));
  const b = sha(nativeParse(path));
  const c = sha(wasmParse(path, rel));
  if (a !== b) {
    console.error(`NONDETERMINISTIC native run: ${rel} (${a} != ${b})`);
    failures += 1;
  }
  if (a !== c) {
    console.error(`native != wasm: ${rel} (${a} != ${c})`);
    failures += 1;
  }
}

console.log(`determinism: ${files.length} files, native x2 + wasm, ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
