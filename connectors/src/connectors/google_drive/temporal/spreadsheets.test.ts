import type {
  Sheet,
  SheetContentEvent,
  StreamSheetRows,
} from "@connectors/connectors/google_drive/temporal/spreadsheets";
import {
  fetchSheetContentsAsCsv,
  sheetValuesRange,
  streamRowsFromValuesJson,
} from "@connectors/connectors/google_drive/temporal/spreadsheets";
import logger from "@connectors/logger/logger";
import { stringify } from "csv-stringify/sync";
import { Readable } from "stream";
import { describe, expect, it } from "vitest";

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 1,
    spreadsheet: { id: "spreadsheet-id", title: "My Spreadsheet" },
    title: "Sheet1",
    gridRowCount: 10,
    ...overrides,
  };
}

// Serves per-sheet fixtures as chunked row streams the way the streamed values.get produces
// them, recording the chunks pulled per sheet and whether each sheet's stream was torn down
// (its finally ran) — the observable proof that an aborted consumer closes the stream.
function makeRowStreamer(
  rowsBySheetTitle: Record<string, string[][]>,
  { chunkRows = 1000 }: { chunkRows?: number } = {}
) {
  const pulledChunks: Record<string, number> = {};
  const closedSheets: string[] = [];
  const streamSheetRows: StreamSheetRows = async function* (sheet) {
    try {
      const allRows = rowsBySheetTitle[sheet.title];
      if (!allRows) {
        throw new Error(`Unknown sheet: ${sheet.title}`);
      }
      for (let i = 0; i < allRows.length; i += chunkRows) {
        pulledChunks[sheet.title] = (pulledChunks[sheet.title] ?? 0) + 1;
        yield { kind: "rows", rows: allRows.slice(i, i + chunkRows) };
      }
    } finally {
      closedSheets.push(sheet.title);
    }
  };
  return { streamSheetRows, pulledChunks, closedSheets };
}

async function collectEvents(
  events: AsyncGenerator<SheetContentEvent, void>
): Promise<SheetContentEvent[]> {
  const collected: SheetContentEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe("fetchSheetContentsAsCsv", () => {
  it("builds the CSV from the sheet values", async () => {
    const sheet = makeSheet();
    const { streamSheetRows } = makeRowStreamer({
      Sheet1: [
        ["h1", "h2"],
        ["a", "b"],
        ["c", "d"],
      ],
    });

    const events = await collectEvents(
      fetchSheetContentsAsCsv([sheet], streamSheetRows, logger)
    );

    expect(events).toEqual([
      {
        type: "sheet",
        sheet,
        content: { outcome: "csv", csv: "h1,h2\na,b\nc,d\n", rowCount: 3 },
      },
    ]);
  });

  it("pads every row to the widest row with empty cells", async () => {
    const { streamSheetRows } = makeRowStreamer({
      Sheet1: [["h1"], ["a", "b", "c"], ["d", "e"]],
    });

    const events = await collectEvents(
      fetchSheetContentsAsCsv([makeSheet()], streamSheetRows, logger)
    );

    expect(events).toMatchObject([
      {
        type: "sheet",
        content: { outcome: "csv", csv: "h1,,\na,b,c\nd,e,\n", rowCount: 3 },
      },
    ]);
  });

  it("produces the same CSV as stringifying the padded rows at once", async () => {
    const rows = [
      ["header 1", "header,2", "header\n3"],
      ["plain", 'quo"ted', ""],
      ["wide", "row", "with", "extra", "cells"],
      ["", " ", "kept: has a whitespace cell"],
    ];
    const { streamSheetRows } = makeRowStreamer({ Sheet1: rows });

    const events = await collectEvents(
      fetchSheetContentsAsCsv([makeSheet()], streamSheetRows, logger)
    );

    // Replicates the previous implementation: pad all rows to the widest row, stringify at once.
    const maxCols = Math.max(...rows.map((row) => row.length));
    const paddedRows = rows.map((row) => [
      ...row,
      ...Array(maxCols - row.length).fill(""),
    ]);
    const expectedCsv = stringify(paddedRows);

    expect(events).toMatchObject([
      { type: "sheet", content: { outcome: "csv", csv: expectedCsv } },
    ]);
  });

  it("filters out rows with no data", async () => {
    const { streamSheetRows } = makeRowStreamer({
      Sheet1: [["", ""], ["h1", "h2"], [], [" ", "  "], ["a", "b"]],
    });

    const events = await collectEvents(
      fetchSheetContentsAsCsv([makeSheet()], streamSheetRows, logger)
    );

    expect(events).toMatchObject([
      {
        type: "sheet",
        content: { outcome: "csv", csv: "h1,h2\na,b\n", rowCount: 2 },
      },
    ]);
  });

  it("consumes each sheet's chunks fully and routes rows to their own sheet", async () => {
    const sheets = [
      makeSheet({ id: 1, title: "A", gridRowCount: 2500 }),
      makeSheet({ id: 2, title: "B", gridRowCount: 100 }),
    ];
    const { streamSheetRows, pulledChunks } = makeRowStreamer({
      A: Array.from({ length: 2500 }, (_, i) => [`a${i}`]),
      B: Array.from({ length: 100 }, (_, i) => [`b${i}`]),
    });

    const events = await collectEvents(
      fetchSheetContentsAsCsv(sheets, streamSheetRows, logger)
    );

    expect(pulledChunks).toEqual({ A: 3, B: 1 });
    expect(events).toMatchObject([
      { type: "sheet", sheet: { id: 1 }, content: { rowCount: 2500 } },
      { type: "sheet", sheet: { id: 2 }, content: { rowCount: 100 } },
    ]);
    for (const [event, letter] of [
      [events[0], "a"],
      [events[1], "b"],
    ] as const) {
      if (event?.type !== "sheet" || event.content.outcome !== "csv") {
        throw new Error("Expected a csv sheet event");
      }
      expect(event.content.csv.startsWith(`${letter}0\n`)).toBe(true);
    }
  });

  it("stops pulling and closes the stream once the sheet exceeds the maximum number of rows", async () => {
    const allRows = Array.from({ length: 60000 }, (_, i) => [`a${i}`]);
    const { streamSheetRows, pulledChunks, closedSheets } = makeRowStreamer({
      Sheet1: allRows,
    });

    const events = await collectEvents(
      fetchSheetContentsAsCsv(
        [makeSheet({ gridRowCount: 60000 })],
        streamSheetRows,
        logger
      )
    );

    expect(events).toMatchObject([
      { type: "sheet", content: { outcome: "no_content" } },
    ]);
    // The cap trips on the chunk containing the 50001st row; the remaining chunks are never
    // pulled and the stream is torn down.
    expect(pulledChunks.Sheet1).toBe(51);
    expect(closedSheets).toEqual(["Sheet1"]);
  });

  it("stops pulling and closes the stream once the CSV exceeds the maximum size", async () => {
    // 4 rows of 20MB cross the 50MB cap on the 3rd big cell.
    const bigCell = "x".repeat(20 * 1024 * 1024);
    const { streamSheetRows, pulledChunks, closedSheets } = makeRowStreamer(
      { Sheet1: [["h1"], [bigCell], [bigCell], [bigCell], [bigCell]] },
      { chunkRows: 1 }
    );

    const events = await collectEvents(
      fetchSheetContentsAsCsv([makeSheet()], streamSheetRows, logger)
    );

    expect(events).toMatchObject([
      { type: "sheet", content: { outcome: "too_large" } },
    ]);
    // The cap trips on the 4th row (3rd big cell); the 5th row is never pulled.
    expect(pulledChunks.Sheet1).toBe(4);
    expect(closedSheets).toEqual(["Sheet1"]);
  });

  it("detects a too-large CSV when a late wide row inflates the padding", async () => {
    // 5000 one-cell rows weigh ~10KB unpadded, but padded to the 11000 columns of the late wide
    // row every line weighs ~11KB — over 50MB in total. The following sheet still syncs.
    const wideRow = ["y", ...Array(10999).fill("")];
    const sheets = [
      makeSheet({ id: 1, title: "Wide", gridRowCount: 5001 }),
      makeSheet({ id: 2, title: "Small", gridRowCount: 10 }),
    ];
    const { streamSheetRows } = makeRowStreamer({
      Wide: [...Array.from({ length: 5000 }, () => ["x"]), wideRow],
      Small: [["h1"], ["a"]],
    });

    const events = await collectEvents(
      fetchSheetContentsAsCsv(sheets, streamSheetRows, logger)
    );

    expect(events).toMatchObject([
      { type: "sheet", sheet: { id: 1 }, content: { outcome: "too_large" } },
      {
        type: "sheet",
        sheet: { id: 2 },
        content: { outcome: "csv", rowCount: 2 },
      },
    ]);
  });

  it("skips only a sheet whose values cannot be read", async () => {
    const sheets = [
      makeSheet({ id: 1, title: "A" }),
      makeSheet({ id: 2, title: "B" }),
      makeSheet({ id: 3, title: "C" }),
    ];
    const { streamSheetRows } = makeRowStreamer({
      B: [["h1"], ["b"]],
      C: [["h1"], ["c"]],
    });
    const notReadableFirst: StreamSheetRows = async function* (sheet) {
      if (sheet.title === "A") {
        yield { kind: "sheet_not_readable" };
        return;
      }
      yield* streamSheetRows(sheet);
    };

    const events = await collectEvents(
      fetchSheetContentsAsCsv(sheets, notReadableFirst, logger)
    );

    expect(events).toMatchObject([
      { type: "sheet", sheet: { id: 1 }, content: { outcome: "no_content" } },
      { type: "sheet", sheet: { id: 2 }, content: { outcome: "csv" } },
      { type: "sheet", sheet: { id: 3 }, content: { outcome: "csv" } },
    ]);
  });

  it("returns no_content when the sheet has no data", async () => {
    const { streamSheetRows } = makeRowStreamer({ Sheet1: [] });

    const events = await collectEvents(
      fetchSheetContentsAsCsv([makeSheet()], streamSheetRows, logger)
    );

    expect(events).toMatchObject([
      { type: "sheet", content: { outcome: "no_content" } },
    ]);
  });

  it("returns no_content without opening a stream for an empty grid", async () => {
    const { streamSheetRows, closedSheets } = makeRowStreamer({});

    const events = await collectEvents(
      fetchSheetContentsAsCsv(
        [makeSheet({ gridRowCount: 0 })],
        streamSheetRows,
        logger
      )
    );

    expect(closedSheets).toEqual([]);
    expect(events).toMatchObject([
      { type: "sheet", content: { outcome: "no_content" } },
    ]);
  });

  it("propagates a file-level skip and stops fetching", async () => {
    const sheets = [
      makeSheet({ id: 1, title: "A" }),
      makeSheet({ id: 2, title: "B" }),
    ];
    let callCount = 0;
    const skippingStreamer: StreamSheetRows = async function* () {
      callCount += 1;
      yield {
        kind: "skip_file",
        skipReason: "google_internal_server_error",
      };
    };

    const events = await collectEvents(
      fetchSheetContentsAsCsv(sheets, skippingStreamer, logger)
    );

    expect(events).toEqual([
      { type: "skip_file", skipReason: "google_internal_server_error" },
    ]);
    expect(callCount).toBe(1);
  });
});

describe("sheetValuesRange", () => {
  it("escapes single quotes in sheet titles", () => {
    expect(sheetValuesRange("Sheet1")).toBe("'Sheet1'");
    expect(sheetValuesRange("It's a sheet")).toBe("'It''s a sheet'");
  });
});

describe("streamRowsFromValuesJson", () => {
  function valuesResponse(values: unknown): string {
    return JSON.stringify({
      range: "'Sheet1'!A1:Z10",
      majorDimension: "ROWS",
      values,
    });
  }

  async function collectChunks(
    source: Readable,
    chunkRows: number
  ): Promise<string[][][]> {
    const chunks: string[][][] = [];
    for await (const chunk of streamRowsFromValuesJson(source, chunkRows)) {
      chunks.push(chunk);
    }
    return chunks;
  }

  it("yields the rows of the values array in chunks", async () => {
    const source = Readable.from([
      valuesResponse([["a", "b"], ["c"], [], ["d"]]),
    ]);

    const chunks = await collectChunks(source, 3);

    expect(chunks).toEqual([[["a", "b"], ["c"], []], [["d"]]]);
  });

  it("yields nothing when the values field is absent", async () => {
    const source = Readable.from([
      JSON.stringify({ range: "'Sheet1'!A1", majorDimension: "ROWS" }),
    ]);

    expect(await collectChunks(source, 3)).toEqual([]);
  });

  it("rejects on malformed JSON", async () => {
    const source = Readable.from(['{"values": [["a"']);

    await expect(collectChunks(source, 3)).rejects.toThrow();
  });

  it("destroys the source stream on early exit", async () => {
    const source = Readable.from([
      valuesResponse(Array.from({ length: 10 }, (_, i) => [`r${i}`])),
    ]);

    const rowChunks = streamRowsFromValuesJson(source, 2);
    const first = await rowChunks.next();
    expect(first.value).toEqual([["r0"], ["r1"]]);

    await rowChunks.return(undefined);

    expect(source.destroyed).toBe(true);
  });
});
