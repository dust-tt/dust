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
