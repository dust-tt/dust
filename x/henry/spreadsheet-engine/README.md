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

CSV/TSV goes through the same path (format sniffed from bytes + name).

## Error surface

Typed and stable (`EngineErrorException.code`): `UNSUPPORTED_FORMAT` (.xls/BIFF),
`ENCRYPTED`, `CORRUPT`, `BUDGET_EXCEEDED`, `CANCELLED`, `INTERNAL`.
`truncated: true` metadata (partial preview succeeded) is **not** an error.

## Budgets (overridable per open)

| Budget | Default | On exceed |
| --- | --- | --- |
| `maxBytes` | 400 MB | refuse → `BUDGET_EXCEEDED` |
| `maxCellsPerSheet` | 2,000,000 | truncate in row order, `truncated: true` |
| `maxTotalCells` | 8,000,000 | later sheets stay unloaded; activation → `BUDGET_EXCEEDED` |
| zip part decompression cap | 2 GB/part | `CORRUPT` (zip-bomb defusal) |

Principle: always show something — a truncated preview beats a dead spinner.

## Validation (all code-asserted; "looks right" is not a test)

| Gate | Where | Status |
| --- | --- | --- |
| Unit + parser tests | `cargo test -p engine-core` (lib) | 55 tests |
| numfmt golden table (the spec, ≥500 cases) | `tests/numfmt_golden.rs` + `corpus/numfmt_cases.tsv` (~1240 cases, SSF-pinned + Excel-verified curation) | 100% pass required |
| Canonical-JSON goldens (review-blessed) | `tests/golden.rs`, `BLESS=1` to update | byte-exact |
| Corpus freshness (generator ↔ committed) | `tests/golden.rs` | byte-exact |
| Engine vs generator's independent model | `tests/golden.rs::values_match_generator_model` | exact values/types |
| Differential vs calamine | `tests/differential_calamine.rs` | exact (1 documented skip) |
| Differential vs SheetJS (pinned) | `scripts/diff-sheetjs.mjs` | 84k+ cells, exact |
| Property tests (viewport union/containment, truncation monotonicity, search soundness, mutation fuzz-lite) | `tests/properties.rs` (proptest) | green |
| Evil corpus (never panic/hang/OOM; typed outcomes) | `tests/evil.rs` + `corpus/evil/MANIFEST.tsv` | 44+ files |
| Determinism: native ×2 + wasm byte-identical | `scripts/check-determinism.mjs` | hash-equal |
| Wasm size | `scripts/check-wasm-size.mjs` | ~241 KiB gz (gate: warn 1.5 MB / fail 2 MB) |
| RPC layer (cancel, coalescing storm, progress monotonicity, leaks, chunked≡one-shot, memory ceiling over 50 cycles) | `ts/client/test` | 19 tests |
| **Kit integration: real `<XlsxViewer/>` + real engine** (cell texts incl. formats, col widths, frozen panes, tabs, truncation banner, typed errors, unmount lifecycle) | `ts/react/test/kit-integration.test.tsx` | 8 tests |

## Deliberate v1 scope decisions

- **No formula evaluation** — cached results displayed; formula text kept for
  the formula-display mode (matches the kit's behavior).
- **en-US locale only** in numfmt, behind a `Locale` table parameter.
- **Single-threaded wasm in one worker** — no SharedArrayBuffer/COOP/COEP;
  the core has no API that would change if rayon is added later.
- `.xls` (BIFF) and encrypted workbooks → typed errors.
- Charts/images/sparklines/conditional-format visuals are out of viewer scope
  (kit degradations documented in `ts/react/INTEGRATION.md`).
- Panic policy deviation from the spec: stable `wasm32-unknown-unknown`
  cannot `catch_unwind` (no unwinding), so trap→`INTERNAL` mapping lives in
  the worker shim, and "engine never panics" is enforced natively by the evil
  corpus + mutation tests.

## Not in this experiment (next phases)

LibreOffice differential (needs a pinned container; nightly CI), cargo-fuzz
soak, criterion + fuel-metered perf gates with committed baselines, Playwright
screenshot baselines on pinned browsers, the 400 MB browser-path measurement,
and the real-world corpus (`corpus/real/`, pending anonymized samples).
