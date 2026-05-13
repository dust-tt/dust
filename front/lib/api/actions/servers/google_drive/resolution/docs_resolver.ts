import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { docs_v1 } from "googleapis";
import { z } from "zod";

const InsertLocationSchema = z.union([
  z.literal("start").describe("Insert at the beginning of the document body."),
  z.literal("end").describe("Insert at the end of the document body."),
  z
    .object({
      afterText: z
        .string()
        .describe(
          "Text to find in the document; the new content will be inserted immediately after the first occurrence."
        ),
    })
    .describe("Insert immediately after a specific text anchor."),
]);

const HeaderFooterRoleSchema = z
  .enum(["default", "firstPage", "evenPages"])
  .default("default")
  .describe("Which header/footer to target.");

export const DocumentOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replaceText"),
    find: z.string().describe("Text to find (matched anywhere in the doc)."),
    replace: z.string().describe("Replacement text."),
    matchCase: z
      .boolean()
      .optional()
      .describe("Whether the match is case-sensitive. Defaults to false."),
  }),
  z.object({
    type: z.literal("insertText"),
    text: z.string().describe("Text to insert."),
    location: InsertLocationSchema,
  }),
  z.object({
    type: z.literal("deleteText"),
    text: z
      .string()
      .describe("Exact text to delete (first occurrence in the doc)."),
  }),
  z.object({
    type: z.literal("insertTable"),
    rows: z.number().int().positive(),
    columns: z.number().int().positive(),
    location: InsertLocationSchema,
  }),
  z.object({
    type: z.literal("formatText"),
    text: z
      .string()
      .describe("Exact text whose first occurrence should be formatted."),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    fontSizePt: z
      .number()
      .positive()
      .optional()
      .describe("Font size in points."),
  }),
  z.object({
    type: z.literal("replaceTableCell"),
    tableIndex: z
      .number()
      .int()
      .min(0)
      .describe("0-indexed table in document order."),
    rowIndex: z
      .number()
      .int()
      .min(0)
      .describe("0-indexed row within the table."),
    columnIndex: z
      .number()
      .int()
      .min(0)
      .describe("0-indexed column within the table."),
    content: z
      .string()
      .describe("New content that replaces the entire cell text."),
  }),
  z.object({
    type: z.literal("insertInTableCell"),
    tableIndex: z.number().int().min(0),
    rowIndex: z.number().int().min(0),
    columnIndex: z.number().int().min(0),
    content: z.string().describe("Text to insert into the cell."),
    position: z
      .enum(["start", "end"])
      .default("start")
      .describe("Where to insert relative to existing cell content."),
  }),
  z.object({
    type: z.literal("insertTableRow"),
    tableIndex: z.number().int().min(0),
    afterRowIndex: z
      .number()
      .int()
      .min(-1)
      .describe(
        "Insert after this row index. Use -1 to insert before the first row."
      ),
  }),
  z.object({
    type: z.literal("insertTableColumn"),
    tableIndex: z.number().int().min(0),
    afterColumnIndex: z
      .number()
      .int()
      .min(-1)
      .describe(
        "Insert after this column index. Use -1 to insert before the first column."
      ),
  }),
  z.object({
    type: z.literal("deleteTableRow"),
    tableIndex: z.number().int().min(0),
    rowIndex: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("deleteTableColumn"),
    tableIndex: z.number().int().min(0),
    columnIndex: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("replaceHeaderFooterText"),
    segment: z.enum(["header", "footer"]),
    role: HeaderFooterRoleSchema,
    find: z.string().describe("Text to find within the header/footer."),
    replace: z.string().describe("Replacement text."),
  }),
  z.object({
    type: z.literal("insertInHeaderFooter"),
    segment: z.enum(["header", "footer"]),
    role: HeaderFooterRoleSchema,
    content: z.string(),
    position: z.enum(["start", "end"]).default("end"),
  }),
  z.object({
    type: z.literal("raw"),
    request: z
      .record(z.string(), z.any())
      .describe(
        "Raw Google Docs batchUpdate request object (e.g. {insertTableRow: {...}}). Use this as an escape hatch when no lean operation covers your need."
      ),
  }),
]);

export type DocumentOperation = z.infer<typeof DocumentOperationSchema>;

export const DocumentOperationsArraySchema = z.array(DocumentOperationSchema);

type TextRunInfo = { startIndex: number; content: string };

function* iterTextRuns(
  doc: docs_v1.Schema$Document
): Generator<TextRunInfo, void, unknown> {
  for (const element of doc.body?.content ?? []) {
    if (element.paragraph?.elements) {
      for (const elem of element.paragraph.elements) {
        if (elem.textRun?.content != null && elem.startIndex != null) {
          yield { startIndex: elem.startIndex, content: elem.textRun.content };
        }
      }
    }
    if (element.table?.tableRows) {
      for (const row of element.table.tableRows) {
        for (const cell of row.tableCells ?? []) {
          for (const cellElement of cell.content ?? []) {
            if (cellElement.paragraph?.elements) {
              for (const elem of cellElement.paragraph.elements) {
                if (elem.textRun?.content != null && elem.startIndex != null) {
                  yield {
                    startIndex: elem.startIndex,
                    content: elem.textRun.content,
                  };
                }
              }
            }
          }
        }
      }
    }
  }
}

type FlatIndex = { flatText: string; charToDocIndex: number[] };

function buildFlatIndex(doc: docs_v1.Schema$Document): FlatIndex {
  const charToDocIndex: number[] = [];
  let flatText = "";
  for (const { startIndex, content } of iterTextRuns(doc)) {
    for (let i = 0; i < content.length; i++) {
      charToDocIndex.push(startIndex + i);
    }
    flatText += content;
  }
  return { flatText, charToDocIndex };
}

function findRange(
  flat: FlatIndex,
  text: string
): { startIndex: number; endIndex: number } | null {
  if (text.length === 0) {
    return null;
  }
  const pos = flat.flatText.indexOf(text);
  if (pos === -1) {
    return null;
  }
  const startIndex = flat.charToDocIndex[pos];
  const endIndex = flat.charToDocIndex[pos + text.length - 1] + 1;
  return { startIndex, endIndex };
}

function getBodyEndIndex(doc: docs_v1.Schema$Document): number {
  const content = doc.body?.content ?? [];
  if (content.length === 0) {
    return 1;
  }
  const last = content[content.length - 1];
  if (last.endIndex == null) {
    // Google always populates endIndex on body elements; fall back defensively
    // rather than throw — the API call will surface a clearer error if the
    // index is wrong.
    return 1;
  }
  // endIndex of the last element points just past the trailing newline; valid
  // insertion is at (endIndex - 1).
  return last.endIndex - 1;
}

function resolveInsertLocation(
  doc: docs_v1.Schema$Document,
  flat: FlatIndex,
  location: z.infer<typeof InsertLocationSchema>
): Result<number, Error> {
  if (location === "start") {
    return new Ok(1);
  }
  if (location === "end") {
    return new Ok(getBodyEndIndex(doc));
  }
  const range = findRange(flat, location.afterText);
  if (!range) {
    return new Err(
      new Error(`Anchor text not found in document: "${location.afterText}"`)
    );
  }
  return new Ok(range.endIndex);
}

type IndexedRequest = {
  request: docs_v1.Schema$Request;
  sortKey: number;
};

type TableInBody = {
  table: docs_v1.Schema$Table;
  startIndex: number;
};

function collectTables(doc: docs_v1.Schema$Document): TableInBody[] {
  const tables: TableInBody[] = [];
  for (const element of doc.body?.content ?? []) {
    if (element.table && element.startIndex != null) {
      tables.push({ table: element.table, startIndex: element.startIndex });
    }
  }
  return tables;
}

type ResolvedCell = {
  /**
   * Doc index of the table's start (for tableCellLocation.tableStartLocation).
   */
  tableStartIndex: number;
  /**
   * Index where insertText should write into the cell — Google Docs requires
   * cellStart + 1 (the cell's startIndex points to a structural boundary).
   */
  insertIndex: number;
  /**
   * Last doc index covered by the cell's content. Use endIndex - 1 as the
   * exclusive end when deleting existing cell content.
   */
  endIndex: number;
  hasContent: boolean;
};

function resolveTableCell(
  doc: docs_v1.Schema$Document,
  tableIndex: number,
  rowIndex: number,
  columnIndex: number
): Result<ResolvedCell, Error> {
  const tables = collectTables(doc);
  if (tableIndex >= tables.length) {
    return new Err(
      new Error(
        `Table index ${tableIndex} out of range (document has ${tables.length} table(s)).`
      )
    );
  }
  const { table, startIndex: tableStartIndex } = tables[tableIndex];
  const row = table.tableRows?.[rowIndex];
  if (!row) {
    return new Err(
      new Error(
        `Row index ${rowIndex} out of range in table ${tableIndex} (${table.tableRows?.length ?? 0} row(s)).`
      )
    );
  }
  const cell = row.tableCells?.[columnIndex];
  if (!cell) {
    return new Err(
      new Error(
        `Column index ${columnIndex} out of range in table ${tableIndex} row ${rowIndex} (${row.tableCells?.length ?? 0} column(s)).`
      )
    );
  }
  if (cell.startIndex == null || cell.endIndex == null) {
    return new Err(
      new Error(
        `Table ${tableIndex} cell [${rowIndex},${columnIndex}] is missing index information.`
      )
    );
  }
  // Cell content lives between cellStart + 1 (the cell's startIndex points to
  // a structural boundary, not insertable text) and cellEnd - 1 (cellEnd is
  // the exclusive boundary of the next cell).
  const insertIndex = cell.startIndex + 1;
  const endIndex = cell.endIndex;
  const hasContent = endIndex - 1 > insertIndex;
  return new Ok({ tableStartIndex, insertIndex, endIndex, hasContent });
}

function resolveTableStartIndex(
  doc: docs_v1.Schema$Document,
  tableIndex: number
): Result<number, Error> {
  const tables = collectTables(doc);
  if (tableIndex >= tables.length) {
    return new Err(
      new Error(
        `Table index ${tableIndex} out of range (document has ${tables.length} table(s)).`
      )
    );
  }
  return new Ok(tables[tableIndex].startIndex);
}

type HeaderFooterSegmentInfo = {
  segmentId: string;
  startIndex: number;
  endIndex: number;
};

function resolveHeaderFooterSegment(
  doc: docs_v1.Schema$Document,
  segment: "header" | "footer",
  role: "default" | "firstPage" | "evenPages"
): Result<HeaderFooterSegmentInfo, Error> {
  const docStyle = doc.documentStyle;
  if (!docStyle) {
    return new Err(new Error(`Document has no documentStyle.`));
  }
  let segmentId: string | null | undefined;
  if (segment === "header") {
    segmentId =
      role === "default"
        ? docStyle.defaultHeaderId
        : role === "firstPage"
          ? docStyle.firstPageHeaderId
          : docStyle.evenPageHeaderId;
  } else {
    segmentId =
      role === "default"
        ? docStyle.defaultFooterId
        : role === "firstPage"
          ? docStyle.firstPageFooterId
          : docStyle.evenPageFooterId;
  }
  if (!segmentId) {
    return new Err(new Error(`No ${role} ${segment} found on this document.`));
  }
  const collection = segment === "header" ? doc.headers : doc.footers;
  const segmentBody = collection?.[segmentId];
  const content = segmentBody?.content ?? [];
  if (content.length === 0) {
    // Empty header/footer: index 0 is the only valid insertion point.
    return new Ok({ segmentId, startIndex: 0, endIndex: 0 });
  }
  const first = content[0];
  const last = content[content.length - 1];
  if (first.startIndex == null || last.endIndex == null) {
    return new Err(
      new Error(`${segment} segment ${segmentId} is missing index information.`)
    );
  }
  return new Ok({
    segmentId,
    startIndex: first.startIndex,
    endIndex: last.endIndex - 1,
  });
}

export function resolveDocOperations(
  doc: docs_v1.Schema$Document,
  operations: DocumentOperation[]
): Result<docs_v1.Schema$Request[], Error> {
  const flat = buildFlatIndex(doc);
  const indexedOps: IndexedRequest[] = [];
  const nonIndexedOps: docs_v1.Schema$Request[] = [];
  const rawOps: docs_v1.Schema$Request[] = [];

  for (const op of operations) {
    switch (op.type) {
      case "replaceText": {
        nonIndexedOps.push({
          replaceAllText: {
            containsText: {
              text: op.find,
              matchCase: op.matchCase ?? false,
            },
            replaceText: op.replace,
          },
        });
        break;
      }
      case "insertText": {
        const indexResult = resolveInsertLocation(doc, flat, op.location);
        if (indexResult.isErr()) {
          return new Err(new Error(`insertText: ${indexResult.error.message}`));
        }
        const index = indexResult.value;
        indexedOps.push({
          request: { insertText: { text: op.text, location: { index } } },
          sortKey: index,
        });
        break;
      }
      case "deleteText": {
        const range = findRange(flat, op.text);
        if (!range) {
          return new Err(
            new Error(`deleteText: Text not found in document: "${op.text}"`)
          );
        }
        indexedOps.push({
          request: { deleteContentRange: { range } },
          sortKey: range.startIndex,
        });
        break;
      }
      case "insertTable": {
        const indexResult = resolveInsertLocation(doc, flat, op.location);
        if (indexResult.isErr()) {
          return new Err(
            new Error(`insertTable: ${indexResult.error.message}`)
          );
        }
        const index = indexResult.value;
        indexedOps.push({
          request: {
            insertTable: {
              rows: op.rows,
              columns: op.columns,
              location: { index },
            },
          },
          sortKey: index,
        });
        break;
      }
      case "formatText": {
        const range = findRange(flat, op.text);
        if (!range) {
          return new Err(
            new Error(`formatText: Text not found in document: "${op.text}"`)
          );
        }
        const textStyle: docs_v1.Schema$TextStyle = {};
        const fields: string[] = [];
        if (op.bold !== undefined) {
          textStyle.bold = op.bold;
          fields.push("bold");
        }
        if (op.italic !== undefined) {
          textStyle.italic = op.italic;
          fields.push("italic");
        }
        if (op.underline !== undefined) {
          textStyle.underline = op.underline;
          fields.push("underline");
        }
        if (op.fontSizePt !== undefined) {
          textStyle.fontSize = { magnitude: op.fontSizePt, unit: "PT" };
          fields.push("fontSize");
        }
        if (fields.length === 0) {
          return new Err(
            new Error(
              "formatText: at least one of bold, italic, underline, fontSizePt must be set."
            )
          );
        }
        indexedOps.push({
          request: {
            updateTextStyle: {
              range,
              textStyle,
              fields: fields.join(","),
            },
          },
          sortKey: range.startIndex,
        });
        break;
      }
      case "replaceTableCell": {
        const cellResult = resolveTableCell(
          doc,
          op.tableIndex,
          op.rowIndex,
          op.columnIndex
        );
        if (cellResult.isErr()) {
          return new Err(
            new Error(`replaceTableCell: ${cellResult.error.message}`)
          );
        }
        const { insertIndex, endIndex, hasContent } = cellResult.value;
        if (hasContent) {
          indexedOps.push({
            request: {
              deleteContentRange: {
                range: { startIndex: insertIndex, endIndex: endIndex - 1 },
              },
            },
            sortKey: insertIndex,
          });
        }
        indexedOps.push({
          request: {
            insertText: { text: op.content, location: { index: insertIndex } },
          },
          sortKey: insertIndex,
        });
        break;
      }
      case "insertInTableCell": {
        const cellResult = resolveTableCell(
          doc,
          op.tableIndex,
          op.rowIndex,
          op.columnIndex
        );
        if (cellResult.isErr()) {
          return new Err(
            new Error(`insertInTableCell: ${cellResult.error.message}`)
          );
        }
        const { insertIndex, endIndex } = cellResult.value;
        const index = op.position === "end" ? endIndex - 1 : insertIndex;
        indexedOps.push({
          request: {
            insertText: { text: op.content, location: { index } },
          },
          sortKey: index,
        });
        break;
      }
      case "insertTableRow": {
        const startResult = resolveTableStartIndex(doc, op.tableIndex);
        if (startResult.isErr()) {
          return new Err(
            new Error(`insertTableRow: ${startResult.error.message}`)
          );
        }
        const tableStartIndex = startResult.value;
        const rowIndex = op.afterRowIndex === -1 ? 0 : op.afterRowIndex;
        const insertBelow = op.afterRowIndex !== -1;
        indexedOps.push({
          request: {
            insertTableRow: {
              tableCellLocation: {
                tableStartLocation: { index: tableStartIndex },
                rowIndex,
                columnIndex: 0,
              },
              insertBelow,
            },
          },
          sortKey: tableStartIndex,
        });
        break;
      }
      case "insertTableColumn": {
        const startResult = resolveTableStartIndex(doc, op.tableIndex);
        if (startResult.isErr()) {
          return new Err(
            new Error(`insertTableColumn: ${startResult.error.message}`)
          );
        }
        const tableStartIndex = startResult.value;
        const columnIndex =
          op.afterColumnIndex === -1 ? 0 : op.afterColumnIndex;
        const insertRight = op.afterColumnIndex !== -1;
        indexedOps.push({
          request: {
            insertTableColumn: {
              tableCellLocation: {
                tableStartLocation: { index: tableStartIndex },
                rowIndex: 0,
                columnIndex,
              },
              insertRight,
            },
          },
          sortKey: tableStartIndex,
        });
        break;
      }
      case "deleteTableRow": {
        const startResult = resolveTableStartIndex(doc, op.tableIndex);
        if (startResult.isErr()) {
          return new Err(
            new Error(`deleteTableRow: ${startResult.error.message}`)
          );
        }
        const tableStartIndex = startResult.value;
        indexedOps.push({
          request: {
            deleteTableRow: {
              tableCellLocation: {
                tableStartLocation: { index: tableStartIndex },
                rowIndex: op.rowIndex,
                columnIndex: 0,
              },
            },
          },
          sortKey: tableStartIndex,
        });
        break;
      }
      case "deleteTableColumn": {
        const startResult = resolveTableStartIndex(doc, op.tableIndex);
        if (startResult.isErr()) {
          return new Err(
            new Error(`deleteTableColumn: ${startResult.error.message}`)
          );
        }
        const tableStartIndex = startResult.value;
        indexedOps.push({
          request: {
            deleteTableColumn: {
              tableCellLocation: {
                tableStartLocation: { index: tableStartIndex },
                rowIndex: 0,
                columnIndex: op.columnIndex,
              },
            },
          },
          sortKey: tableStartIndex,
        });
        break;
      }
      case "replaceHeaderFooterText": {
        // Per PR #24668: replaceAllText operates document-wide and matches
        // text inside headers/footers automatically. We don't need to
        // resolve segmentId for find/replace; we only validate that the
        // segment exists so the model gets a clear error otherwise.
        const segResult = resolveHeaderFooterSegment(doc, op.segment, op.role);
        if (segResult.isErr()) {
          return new Err(
            new Error(`replaceHeaderFooterText: ${segResult.error.message}`)
          );
        }
        nonIndexedOps.push({
          replaceAllText: {
            containsText: { text: op.find, matchCase: false },
            replaceText: op.replace,
          },
        });
        break;
      }
      case "insertInHeaderFooter": {
        const segResult = resolveHeaderFooterSegment(doc, op.segment, op.role);
        if (segResult.isErr()) {
          return new Err(
            new Error(`insertInHeaderFooter: ${segResult.error.message}`)
          );
        }
        const { segmentId, startIndex, endIndex } = segResult.value;
        const index = op.position === "start" ? startIndex : endIndex;
        indexedOps.push({
          request: {
            insertText: {
              text: op.content,
              location: { index, segmentId },
            },
          },
          sortKey: index,
        });
        break;
      }
      case "raw": {
        // Escape hatch: caller takes responsibility for the request shape; the
        // googleapis Schema$Request type is too wide to typeguard usefully.
        rawOps.push(op.request as docs_v1.Schema$Request);
        break;
      }
      default:
        assertNever(op);
    }
  }

  // Apply index-based operations from highest to lowest index so that earlier
  // positions are not invalidated by inserts/deletes higher in the doc.
  indexedOps.sort((a, b) => b.sortKey - a.sortKey);

  return new Ok([
    ...indexedOps.map((o) => o.request),
    ...nonIndexedOps,
    ...rawOps,
  ]);
}
