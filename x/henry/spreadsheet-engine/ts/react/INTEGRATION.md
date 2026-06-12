# Extend UI kit integration — Phase 0 findings and chosen strategy

**Strategy: A (provider/controller injection). Zero fork.**

`@extend-ai/react-xlsx` (pinned `0.10.2`, MIT) accepts an externally built
controller: `<XlsxViewer controller={...} />` / `<XlsxViewerProvider controller={...}>`.
The controller flows through props/context as a plain object — there are no
`instanceof` checks, private symbols, or hidden context requirements. Our
adapter builds that object backed by `@dust/sheet-engine-client`; the kit's
grid, virtualization, toolbar, tabs and chrome are used untouched.

Findings below were established by reading the package's shipped source maps
(`dist/index.js.map` contains full `sourcesContent`) and verified empirically
by rendering the published bundle in jsdom. The vitest suite in
`test/kit-integration.test.tsx` re-verifies the seam against the real package
on every run — a kit upgrade that breaks any of this fails CI.

## 1. The data seam

The kit has a **worker-backed pull mode** designed for exactly this shape of
integration. A controller with:

- `workbook: null`, `getActiveWorksheet: () => null` — no in-process wasm
  workbook (the kit's own `@dukelib/sheets-wasm` is never instantiated);
- `isWorkerBacked: true` — enables progressive grid growth;
- `getRowsBatchAsync(workbookSheetIndex, startRow, rowCount)` — the mere
  presence of this method switches the grid to async pull; it requests the
  visible row span ± 48 rows of overscan and re-fetches only when the viewport
  leaves the previously fetched window;

renders entirely from engine data. The row-batch result must be `JsRow[]`-shaped:

```ts
{ index: number, cells: Array<{
    col: number,
    value: string,            // FINAL display string — number formats applied engine-side
    formula?: string,
    style?: object,           // fully resolved style object (not an id)
    mergeSpan?: { rowSpan?: number, colSpan?: number },
    isMergedSecondary?: boolean,
    hyperlink?: { target?: string, location?: string, tooltip?: string },
} > }
```

The renderer HTML-entity-decodes `value` and applies **no number formatting of
its own** — `numfmt.rs` output is painted verbatim.

## 2. Non-obvious correctness requirements

1. **Axis arrays must be populated.** With `worksheet === null`, column widths
   and row heights come *only* from `XlsxSheetData.visibleCols/colWidths` and
   `visibleRows/rowHeights` (px, parallel arrays over visible indices). The
   kit's own worker path ships them empty — which renders 0-width columns —
   so the adapter materializes them from engine geometry
   (`getSheetGeometry`). `colWidthOverridesPx`/`rowHeightOverridesPx` are only
   read on the worksheet-backed path.
2. **`zoomScale` is a percentage.** `100` = 100%; the kit computes
   `zoomFactor = zoomScale / 100` and clamps to `[10, 400]`. Passing `1`
   renders the grid at the 10% floor.
3. **`revision` clears the committed row batch.** The grid runs
   `setAsyncViewportRowBatch(null)` on `[activeSheetIndex, revision]` changes.
   Bump `revision` only for real data changes, never as a repaint nudge.
4. **The paint tick.** The grid caches per-cell render output; the cache is
   cleared in an effect *after* the render that commits a row batch, so that
   commit render paints stale (empty) cells. The adapter schedules controller
   identity changes shortly after each delivered batch (`paintTick`), forcing
   a repaint from the fresh batch without touching `revision`. This is a
   heuristic, not a guarantee: the kit commits batches inside
   `startTransition`, so the ticks are staggered (0/120/400 ms) to outlast a
   delayed commit; in a live browser any interaction also repaints.
5. **Identity stability.** `getRowsBatchAsync` and `activeSheet` sit in the
   grid's effect dependency arrays. Unstable identities cause refetch loops;
   the adapter memoizes the controller and keeps `getRowsBatchAsync` stable.
6. **Merges** render purely from per-cell `mergeSpan` + `isMergedSecondary` in
   worker mode (`worksheet.mergedRegions` is unavailable) — the engine emits
   both on every batch cell touched by a merge.

## 3. Style mapping

`styles.xml` is resolved engine-side (theme + tint + indexed palette →
8-hex ARGB). The adapter maps the engine's interned style table to the kit's
resolved-style objects (`font.bold/italic/underline/strikethrough/color/size/
name`, `fill.fillType/color/foreground/background`, `border.{top,right,bottom,
left}.{style,color}`, `alignment.horizontal/vertical/wrapText`), with colors as
`{ argb }`. Excel "General" alignment (numbers right) is injected as an
alignment hint when the style has no explicit horizontal alignment.

## 4. Degradations accepted in worker mode (v1 scope)

Sparklines, checkbox cell-controls, conditional-format visuals
(dataBars/colorScales/iconSets) and sheet thumbnails call wasm `Worksheet`
methods directly and are inert with `workbook: null`. Charts/images/shapes are
out of viewer scope. Editing surfaces are stubbed (read-only viewer).

The kit's canvas renderer (`experimentalCanvas`, its default) is also out:
in 0.10.2 the grid's batch-request window (`viewportRequest`) is derived
solely from the DOM virtualizer's virtual items, which are empty in canvas
mode, so `getRowsBatchAsync` is never called and worker-backed cells never
paint (verified in a real browser). Embedders must pass
`experimentalCanvas={false}`; revisit on kit upgrades.

## 5. What the suite asserts (the upgrade safety net)

- Engine-formatted display strings (incl. the 1900-02-29 fake leap day) appear
  in the kit's DOM grid.
- CSV renders through the same viewer with alignment hints.
- Engine column widths land in `<col>` elements (+1px gridline).
- `getRowsBatchAsync` is called with the documented span; frozen panes map to
  `freezePanes`.
- Sheet tabs (hidden/veryHidden filtered), truncation banner (not an error),
  typed error codes, and unmount-closes-handle lifecycle.
