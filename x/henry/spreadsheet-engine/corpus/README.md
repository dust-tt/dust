# Test corpus

Committed, fully regenerable test inputs with per-file expectations. Layout:

| Path | What | Provenance |
| --- | --- | --- |
| `gen/*.xlsx` | Synthetic workbooks covering the v1 feature list (built-in + custom number formats, shared/inline strings, unicode incl. RTL/CJK/emoji/combining marks, merges incl. crossing frozen panes, hidden sheets/rows/cols, 1900/1904 dates incl. serials 0/59/60/61, formulas with cached values of every type, error cells, empty/single-cell sheets, max-row/max-col extremes, 50 sheets, wide/tall shapes, 30k-cell LCG-seeded mixed sheet, duplicate cell refs) | `cargo run -p corpus-gen --release -- corpus`. The generator writes raw XML through its own templates + zip writer — a code path independent of `engine-core`'s parser — so generator and parser cannot share XML-level bugs. Fixed seed; regeneration is byte-identical and CI-asserted. |
| `gen/*.expected.json` | Expected typed cell values per file, emitted from the generator's **in-memory model** (never by parsing the produced file) | same generator run |
| `gen/golden/*.json` | Canonical-JSON goldens (full engine output incl. formatted text, styles, geometry) | blessed engine output: `BLESS=1 cargo test -p engine-core --test golden`; diffs must be reviewed, never auto-blessed in CI |
| `gen/csv/*` | CSV/TSV edge cases: quoting, embedded newlines, escaped quotes, BOM, CRLF/CR/LF, delimiter sniffing (`, ; \t \|`), ragged rows, trailing empty columns, unicode, generated medium file | same generator run |
| `evil/*` + `evil/MANIFEST.tsv` | Adversarial files with committed expectations (typed error / partial / ok): truncations of every gen file at 50%/90%, garbage, zip-not-xlsx, missing sheet part, lying `<dimension>`, out-of-range sharedStrings indices, malformed XML, 50k-deep nesting, 100k merges, 1M-char cell, ~1000x compression ratio, CFB fakes (renamed `.xls`, encrypted marker), zero sheets | same generator run (`corpus-gen/src/evil.rs`) |
| `numfmt_cases.tsv` | The number-format golden table (≥ 500 cases; currently ~1240). **This table is the spec**: `numfmt.rs` must pass 100% (`cargo test --test numfmt_golden`). Columns: value, format, date1904, expected, provenance | `node scripts/gen-numfmt-table.mjs`: grid cases from SheetJS SSF (pinned in `package-lock.json`) + curated rows. Curated provenances: `excel-verified` (Excel ground truth where SSF diverges — JS `Math.round(-0.5)` artifacts, negative fixed-point drift, SSF's `$`-less builtin ids 5-8, negative-serial dates), `pinned` (deliberate engine conventions, documented in the row), `spec §3.4` (the spec's headline cases) |
| `diff-exceptions.toml` | Documented per-(file, cell) differential exceptions. Growing over time is a review smell | hand-maintained (currently empty) |

Comparison conventions:

- Formatted text compares with **trailing whitespace trimmed** (alignment
  padding is invisible in the DOM).
- Differential oracles: calamine (`cargo test --test differential_calamine`),
  SheetJS (`node scripts/diff-sheetjs.mjs`). `extremes.xlsx` is skipped by both
  oracles — they materialize dense ranges and OOM on a 1,048,576 × 16,384 used
  range, which is precisely the failure mode the engine's sparse model avoids.
- LibreOffice headless (spec §7.4 oracle 3) is not wired up here: it needs a
  pinned container image and belongs to nightly CI, not the local loop.

Real-world corpus (`real/`) is intentionally empty in this experiment: user
files cannot be committed without anonymization sign-off (flavien to supply
samples per the spec).
