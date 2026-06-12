# sheet-engine — Rust/WASM spreadsheet engine behind the Extend UI kit

A Rust spreadsheet engine (XLSX parse + workbook model + ECMA-376 number
formatting + viewport/query layer, plus CSV/TSV) compiled to WebAssembly,
running in a dedicated Web Worker, driving the Extend UI kit's
`@extend-ai/react-xlsx` viewer **without forking it**. Experiment under
`x/henry/`; implements the WASM-spreadsheet-engine spec.

```
┌──────────────────────────── Main thread ─────────────────────────────┐
│  <XlsxViewer controller={...}/>   (Extend UI kit, untouched)          │
│        ▲ XlsxSheetData + JsRow batches (O(visible cells))             │
│  ts/react: useDustSheetController  →  kit-shaped controller           │
│        ▲                                                              │
│  ts/client: @dust/sheet-engine-client (RPC, Task, coalescing)         │
└────────┼──────────────────────────────────────────────────────────────┘
         │ postMessage (transferred ArrayBuffers, small JSON slices)
┌────────┼──────────────────────────────────────────── Worker ──────────┐
│  ts/worker: engine-server shim (trap→INTERNAL, streaming fetch)        │
│  crates/engine-wasm: bindings only (handle-based API)                  │
│  crates/engine-core: zip+XML parse · flat sparse model · numfmt ·      │
│                      viewport · search · budgets   (pure Rust, no JS)  │
└────────────────────────────────────────────────────────────────────────┘
```

**Core invariant:** the workbook lives only in WASM linear memory. The main
thread receives metadata (once), viewport/row-batch slices (O(visible cells))
and capped search results — never anything O(workbook).

## Layout

| Path | What |
| --- | --- |
| `crates/engine-core` | 100% of engine logic. Compiles and tests natively (`cargo test`, no wasm). Flat sparse struct-of-arrays sheets, string arenas, interned styles (colors resolved to ARGB at parse), lazy per-sheet parsing, cell budgets with row-major truncation, ECMA-376 numfmt (`numfmt.rs`), viewport + kit-shaped row batches, search. |
| `crates/engine-wasm` | wasm-bindgen wrapper, zero logic. Handle-based: `open_start`/`append_chunk`/`open_finish`/…/`close`. |
| `crates/engine-cli` | `engine-cli parse <file>` → canonical JSON (determinism gate, debugging). |
| `crates/corpus-gen` | Deterministic corpus generator (own XML writer, independent of the parser) + adversarial corpus. |
| `ts/client` | `@dust/sheet-engine-client`: promise-map RPC over postMessage, `Task<T>` (progress + cancel), latest-wins viewport coalescing, FinalizationRegistry close backstop. |
| `ts/worker` | Worker entry (web) + transport-agnostic `engine-server` + node test host. Streaming `fetch` for URL sources (the payload never touches the main thread). Wasm traps map to typed `INTERNAL` and poison the instance. |
| `ts/react` | `useDustSheetController` → kit-compatible `XlsxViewerController` (Strategy A, zero fork). See `ts/react/INTEGRATION.md` for the Phase 0 seam analysis and the non-obvious kit requirements (axis arrays, zoom percentage, revision-vs-paint-tick). |
| `corpus/` | Committed corpora + goldens + the ≥500-case numfmt golden table. See `corpus/README.md`. |
| `scripts/` | Gates: determinism, wasm size, SheetJS differential, numfmt table generator, `check-all.sh`. |

## Quick start

```bash
# toolchain: rust stable + wasm32-unknown-unknown target, node >= 20
rustup target add wasm32-unknown-unknown
npm install

cargo test                  # engine: unit + golden + property + differential + evil
npm run build:wasm          # web + nodejs wasm builds (wasm-pack via npm)
npx vitest run              # RPC client + worker + kit integration (real XlsxViewer)
./scripts/check-all.sh      # everything, in CI order
```

Using it in an app:

```tsx
import { SheetEngineClient } from "@dust/sheet-engine-client";
import { useDustSheetController } from "@dust/sheet-engine-react";
import { XlsxViewer } from "@extend-ai/react-xlsx";

const worker = new Worker(new URL("@dust/sheet-engine-worker", import.meta.url), { type: "module" });
const client = new SheetEngineClient(worker);

function Preview({ url, name }: { url: string; name: string }) {
  const { controller, loading, error, truncated } = useDustSheetController({
    client,
    src: { url }, // worker fetches + streams; bytes also accepted
    fileName: name,
  });
  if (error) return <ErrorState code={error.code} />;
  if (loading || !controller) return <Spinner />;
  return (
    <>
      {truncated && <Banner>File too large to fully preview</Banner>}
      <XlsxViewer controller={controller} readOnly />
    </>
  );
}
```

CSV/TSV goes through the same path (format sniffed from bytes + name; pass
`csvDelimiter: "," | ";" | "\t" | "|"` in the open options to override the
sniffer for ambiguous files).

**Search scope (v1):** `search()` scans loaded sheets only; sheets never
activated are not searched (activating everything would defeat lazy parsing
and the cell budgets).

**SSRF boundary:** `open({ url })` fetches whatever URL the main thread
provides; the engine cannot meaningfully allowlist, and CORS is the only
browser-level control. URL validation/allowlisting is the embedder's
responsibility — prefer `open({ bytes })` when the file is already in hand.

## Worker + wasm asset setup

`@dust/sheet-engine-worker` ships a module-worker entry
(`ts/worker/src/worker-entry.ts`) that imports the **web** wasm build from
`ts/worker/wasm/web/engine.js`. The wasm-bindgen glue resolves
`engine_bg.wasm` relative to its own module URL, so any bundler that
understands `new Worker(new URL(..., import.meta.url), { type: "module" })`
(webpack 5, Vite, Turbopack, Next.js) bundles the worker and emits the
`.wasm` file as a static asset with a hashed URL — no manual copying.

Requirements and non-requirements:

- Serve `.wasm` with `Content-Type: application/wasm` (every CDN/static host
  does; required for `WebAssembly.instantiateStreaming`). The glue falls back
  to non-streaming instantiation if the type is wrong.
- **No COOP/COEP headers needed** — the engine is single-threaded wasm in one
  dedicated worker; it never touches `SharedArrayBuffer`.
- Browser baseline: any engine with module workers + `FinalizationRegistry`
  (Chrome 84+, Firefox 79+, Safari 14.1+). `FinalizationRegistry` is optional
  at runtime (the client degrades to explicit `close()` only).

### Next.js

```tsx
"use client";
import { useMemo } from "react";
import { SheetEngineClient } from "@dust/sheet-engine-client";

function useSheetEngineClient(): SheetEngineClient {
  // One worker per viewer; client.destroy() on unmount terminates it.
  return useMemo(() => {
    const worker = new Worker(
      new URL("@dust/sheet-engine-worker/worker-entry", import.meta.url),
      { type: "module" },
    );
    return new SheetEngineClient(worker);
  }, []);
}
```

Notes for the Next.js app router:

- The component creating the worker must be a client component (`"use
  client"`); workers do not exist during SSR. Gate on `typeof window` if the
  hook can run server-side.
- webpack/Turbopack statically analyze the `new URL(...)` pattern; keep the
  specifier literal (no variables).
- The wasm asset lands under `_next/static/media/` automatically; no
  `next.config.js` changes are required.

## Build & artifacts

`npm run build:wasm` runs wasm-pack twice over `crates/engine-wasm`:

| Output | Target | Consumer |
| --- | --- | --- |
| `ts/worker/wasm/web/` | `--target web` | the browser worker entry |
| `ts/worker/wasm/node/` | `--target nodejs` | vitest suites via `node-host.ts` |

Both directories are **gitignored build outputs** — CI and local checkouts
produce them with `npm run build:wasm` (or `./scripts/check-all.sh`, which
also gates size and determinism). A monorepo consumer depends on the
workspace packages (`@dust/sheet-engine-client`, `@dust/sheet-engine-worker`,
`@dust/sheet-engine-react`) and runs `build:wasm` as part of its build.

## Errors and recovery

Typed and stable (`EngineErrorException.code`); `truncated: true` metadata
(partial preview succeeded) is **not** an error.

| Code | Cause | Embedder action |
| --- | --- | --- |
| `UNSUPPORTED_FORMAT` | `.xls` (BIFF), `.xlsb`, `.ods` — `detail` names the format | show "convert to .xlsx" message |
| `ENCRYPTED` | password-protected OOXML | ask for an unencrypted copy |
| `CORRUPT` | bad zip/XML, lying structure, failed fetch (HTTP ≠ 200) | show generic "file can't be previewed" |
| `BUDGET_EXCEEDED` | byte/cell/decompression budget hit (`detail`: `bytes`/`cells`/`memory`) | file too large to preview; suggest splitting |
| `CANCELLED` | caller cancelled, or client destroyed with calls in flight | usually ignore (the caller initiated it) |
| `INTERNAL` | engine bug, protocol misuse, **or a poisoned worker** | see below |

**Trap → poison → recreate:** a Rust panic inside wasm surfaces as a trap;
the worker shim answers `INTERNAL` with detail `"engine trapped: …; worker
must be recreated"` and poisons the instance — every later call on that
worker also answers `INTERNAL`. Recovery recipe: `client.destroy()`, spawn a
fresh `Worker`, create a new `SheetEngineClient`, re-open the workbook. The
native evil-corpus suite asserts the engine never panics on hostile input, so
this is defense-in-depth, not an expected path.

## Task semantics & coalescing

- `open()` and `search()` return `Task<T>` — a promise with `.progress(cb)`
  (chainable; `open` reports `download` then `parse` phases) and `.cancel()`.
- `open().cancel()` aborts an in-flight download and rejects `CANCELLED`; if
  the open already succeeded worker-side, the handle is closed for you.
- `search().cancel()` is client-local: the wasm scan is synchronous and
  cannot be interrupted; the reply is dropped and the task rejects
  `CANCELLED`.
- `getViewport`/`getRowsBatch` coalesce latest-wins per `(handle, sheet)`:
  during a scroll burst only the in-flight request plus the single latest
  queued one exist. **Superseded callers resolve with the latest caller's
  range, not their own** — by design (scroll always wants the newest window);
  do not assume your exact range was fetched.
- `destroy()` rejects everything outstanding — in-flight and queued — with
  `CANCELLED` and terminates the worker.

## Budgets & limits (overridable per open)

| Budget | Default | On exceed |
| --- | --- | --- |
| `maxBytes` | 400 MB | refuse → `BUDGET_EXCEEDED` (URL opens also fail fast on a larger `content-length` before downloading) |
| `maxCellsPerSheet` | 2,000,000 | truncate in row order, `truncated: true` + `truncatedAtRow` |
| `maxTotalCells` | 8,000,000 | later sheets stay unloaded; activation → `BUDGET_EXCEEDED` |
| zip part decompression cap | 2 GB/part | `CORRUPT` (zip-bomb defusal) |
| total decompression cap | max(64 MB, 20× input size) | `BUDGET_EXCEEDED` (stacked high-ratio parts) |
| geometry overrides (col/row sizes, merges, hyperlinks) | 200,000 each | silently capped |
| sheet name length | 64 chars, control chars stripped | sanitized; `Sheet{n}` fallback |

Truncation UX: `SheetMeta.truncated` plus `truncatedAtRow` (the last row that
still has data; rows from there on may be incomplete). The hook surfaces a
workbook-level `truncated` flag for a banner; an in-grid "data truncated
below row N" affordance can key off `truncatedAtRow`.

Hyperlink targets are sanitized at parse: only `http(s)`, `mailto:`, `ftp://`
and internal `#location` targets survive; `javascript:`/`data:`/`file:`/...
are dropped (the cell is kept).

Performance notes: number formats are parsed once per style (cached on the
style table), not per cell; wasm linear memory never shrinks — the worker
holds its high-water mark until destroyed (the leak gate asserts the mark is
flat across repeated open/close cycles). Measured floors live in
`crates/engine-core/benches` (`cargo bench -p engine-core --bench engine`).
Deliberately deferred until a benchmark proves them out: binary (non-JSON)
wasm transport and differential viewport updates — both add protocol
complexity for wins the current numbers don't justify.

Principle: always show something — a truncated preview beats a dead spinner.

## RPC op chain

One row per protocol op, so `protocol.ts` ↔ `lib.rs` ↔ `engine-server.ts` ↔
`client.ts` cannot silently drift:

| Op | wasm fn | Request | Response |
| --- | --- | --- | --- |
| `open` | `open_start` + `append_chunk`× + `open_finish` | `fileName`, `options?`, `url?`/`bytes?` | `{ handle, meta: WorkbookMeta }` + progress events |
| `metadata` | `get_metadata` | `handle` | `WorkbookMeta` |
| `activateSheet` | `activate_sheet` | `handle`, `sheet` | `SheetMeta` |
| `viewport` | `get_viewport` | `handle`, `sheet`, `rows`, `cols`, `mode` | `ViewportSlice` |
| `rowsBatch` | `get_rows_batch` | `handle`, `sheet`, `startRow`, `rowCount` | `BatchRow[]` |
| `styles` | `get_styles` | `handle` | `ResolvedStyle[]` |
| `geometry` | `get_sheet_geometry` | `handle`, `sheet` | `SheetGeometry` |
| `search` | `search` | `handle`, `query`, `options?` | `SearchResults` |
| `close` | `close` | `handle` | `undefined` |
| `cancel` | — (worker-side abort) | `targetId` | `undefined` |

The supported public surface is `@dust/sheet-engine-client`; the wasm exports
are internal plumbing (see the `engine-wasm` crate docs).

## Validation (all code-asserted; "looks right" is not a test)

| Gate | Where | Status |
| --- | --- | --- |
| Unit + parser tests | `cargo test -p engine-core` (lib) | 80+ tests |
| numfmt golden table (the spec, ≥500 cases) | `tests/numfmt_golden.rs` + `corpus/numfmt_cases.tsv` (~1660 cases, SSF-pinned + Excel-verified curation, 1904 grid, subsecond/rollover carries, locale-reserved builtins) | 100% pass required |
| Canonical-JSON goldens (review-blessed) | `tests/golden.rs`, `BLESS=1` to update | byte-exact |
| Corpus freshness (generator ↔ committed) | `tests/golden.rs` | byte-exact |
| Engine vs generator's independent model | `tests/golden.rs::values_match_generator_model` | exact values/types |
| Differential vs calamine | `tests/differential_calamine.rs` | exact (1 documented skip) |
| Differential vs SheetJS (pinned) | `scripts/diff-sheetjs.mjs` | 84k+ cells, exact |
| Property tests (viewport union/containment, truncation monotonicity, search soundness, mutation fuzz-lite) | `tests/properties.rs` (proptest) | green |
| Evil corpus (never panic/hang/OOM; typed outcomes; XSS hyperlinks, zip bombs, rel escapes, hostile names) | `tests/evil.rs` + `corpus/evil/MANIFEST.tsv` | 50+ files |
| Determinism: native ×2 + wasm byte-identical | `scripts/check-determinism.mjs` | hash-equal |
| Wasm size | `scripts/check-wasm-size.mjs` | ~245 KiB gz (gate: warn 1.5 MB / fail 2 MB) |
| Benchmarks (parse, viewport, batch, search, numfmt) | `crates/engine-core/benches` (criterion; compile-gated in check-all, numbers non-gating) | recorded locally |
| RPC layer (cancel, coalescing interleavings, progress monotonicity, leaks, chunked≡one-shot, memory ceiling over 50 cycles, content-length fail-fast, FinalizationRegistry backstop) | `ts/client/test` + `ts/worker/test` (incl. trap-poisoning, destroy/close lifecycle) | 37 tests |
| **Kit integration: real `<XlsxViewer/>` + real engine** (cell texts incl. formats, styles/merges/hidden geometry in the DOM, hyperlink sanitization, col widths, frozen panes, tabs, truncation banner, typed errors, hook error paths, unmount lifecycle) | `ts/react/test/` | 16 tests |

## Deliberate scope decisions

- **No formula evaluation** — cached results displayed; formula text kept for
  the formula-display mode (matches the kit's behavior).
- **en-US locale only** in numfmt, behind a `Locale` table parameter.
  Locale-reserved builtin numfmt ids (27–36, 50–58) resolve to General.
- **Single-threaded wasm in one worker** — no SharedArrayBuffer/COOP/COEP;
  the core has no API that would change if rayon is added later.
- `.xls` (BIFF), `.xlsb`, `.ods` and encrypted workbooks → typed errors that
  name the format.
- Charts/images/sparklines/conditional-format visuals are out of viewer scope
  (kit degradations documented in `ts/react/INTEGRATION.md`).
- Panic policy: stable `wasm32-unknown-unknown` cannot `catch_unwind` (no
  unwinding), so trap→`INTERNAL` mapping lives in the worker shim, and
  "engine never panics" is enforced natively by the evil corpus + mutation
  tests.

### Known silent drops (parsed input the viewer flattens or ignores)

| Feature | Current behavior |
| --- | --- |
| Rich text runs (per-run formatting inside a cell) | flattened to plain text |
| Cell comments / notes (`xl/comments*.xml`) | dropped |
| Images, charts, sparklines, shapes | dropped (kit collections stay empty) |
| Conditional formatting (color scales, data bars, rules) | dropped |
| Grouped/outlined rows and columns | grouping ignored (rows still render) |
| Right-to-left sheets | rendered left-to-right |
| Gradient fills, diagonal borders | dropped (solid/pattern fills and h/v borders kept) |
| `*x` fill tokens in number formats | render nothing (column fill is meaningless in a DOM grid) |

Each is parseable later without model changes; none blocks the read-only
viewer use case.

## Maintainer runbook

- **Bless goldens:** `BLESS=1 cargo test -p engine-core --test golden`
  rewrites `corpus/gen/golden/*.json`; review the diff like code — goldens
  are the pinned behavior.
- **Add a corpus file:** add a builder in `crates/corpus-gen/src/corpus.rs`
  (or `evil.rs` with an expectation), run
  `cargo run -p corpus-gen --release`, commit the regenerated `corpus/`, then
  bless goldens. CI asserts committed bytes == generator output, so never
  hand-edit corpus files.
- **Evil expectations:** `"CORRUPT" | "UNSUPPORTED_FORMAT" | "ENCRYPTED"`
  (exact), `"partial"` (open may succeed or fail CORRUPT), `"ok"` (open +
  full read path must succeed). Every new parser path gets an evil file in
  the same commit.
- **numfmt table:** edit `scripts/gen-numfmt-table.mjs` (grids or CURATED),
  run `node scripts/gen-numfmt-table.mjs`, commit the regenerated TSV
  (check-all fails on drift). Curated rows carry provenance:
  `excel-verified` (ground truth where SSF diverges), `pinned` (deliberate
  engine convention), `deviation` (intentional difference, documented).
  SheetJS here is a dev-time oracle only — it never ships and runs only on
  the trusted self-generated corpus, so its CVE surface is acceptable (note
  kept here deliberately).
- **Kit upgrade:** bump `@extend-ai/react-xlsx`, re-run
  `npx vitest run ts/react`, and re-verify the findings in
  `ts/react/INTEGRATION.md` (axis arrays, zoom percentage, paint-tick
  heuristic) — the suite is designed to fail loudly if the seam moved.
- **Determinism:** engine-core bans clocks/randomness (grep gate) and all
  float printing goes through ryu; `check-determinism.mjs` byte-compares
  native ×2 + wasm canonical JSON.

## Not in this experiment (next phases)

LibreOffice differential (needs a pinned container; nightly CI), cargo-fuzz
soak, fuel-metered perf gates with committed criterion baselines, a
browser-real Playwright smoke test (jsdom cannot validate virtualization or
the paint-tick heuristic; needs a headless-browser CI job), worker crash
recovery UX (a distinct `POISONED` signal + automatic client recreation),
auth headers for `open({ url })`, search UI wiring in the kit, comments
parsing, conditional-formatting visuals, the 400 MB browser-path
measurement, and the real-world third-party corpus (`corpus/real/`, pending
anonymized Excel/LibreOffice/Google-Sheets-saved samples).
