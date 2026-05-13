import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { slides_v1 } from "googleapis";
import { z } from "zod";

// Slides API sizes/positions are in EMU (English Metric Units). 914_400 EMU = 1 inch.
const TEXTBOX_DEFAULT_WIDTH_EMU = 3_000_000; // ~3.28in
const TEXTBOX_DEFAULT_HEIGHT_EMU = 1_000_000; // ~1.09in
const TEXTBOX_DEFAULT_OFFSET_EMU = 500_000; // ~0.55in from top-left of slide

const ShapeIdentifierSchema = z
  .union([
    z.object({
      byText: z
        .string()
        .describe("Find the first shape on the slide containing this text."),
    }),
    z.object({
      byIndex: z
        .number()
        .int()
        .min(0)
        .describe("0-indexed shape on the slide (order in pageElements)."),
    }),
    z.object({
      byType: z
        .enum(["TITLE", "SUBTITLE", "BODY", "TEXT_BOX"])
        .describe(
          "Match by placeholder type (TITLE / SUBTITLE / BODY) or shape type (TEXT_BOX)."
        ),
    }),
  ])
  .describe("How to identify the target shape on the slide.");

export const PresentationOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replaceAllText"),
    find: z.string().describe("Text to find."),
    replace: z
      .string()
      .describe("Replacement text. Preserves existing formatting."),
    matchCase: z.boolean().optional(),
    slideNumbers: z
      .array(z.number().int().positive())
      .optional()
      .describe(
        "1-indexed slide numbers to scope the replacement to. If omitted, replaces across all slides."
      ),
  }),
  z.object({
    type: z.literal("replaceShapeText"),
    slideNumber: z
      .number()
      .int()
      .positive()
      .describe("1-indexed slide number."),
    shapeIdentifier: ShapeIdentifierSchema,
    content: z
      .string()
      .describe("New text content (replaces all existing text in the shape)."),
  }),
  z.object({
    type: z.literal("insertInShape"),
    slideNumber: z.number().int().positive(),
    shapeIdentifier: ShapeIdentifierSchema,
    content: z.string(),
    position: z.enum(["start", "end"]).default("end"),
  }),
  z.object({
    type: z.literal("replaceSlideTableCell"),
    slideNumber: z.number().int().positive(),
    tableIndex: z
      .number()
      .int()
      .min(0)
      .describe("0-indexed table on the slide (usually 0 if only one table)."),
    rowIndex: z.number().int().min(0),
    columnIndex: z.number().int().min(0),
    content: z.string(),
  }),
  z.object({
    type: z.literal("replaceNotes"),
    slideNumber: z.number().int().positive(),
    content: z
      .string()
      .describe("New speaker notes content (replaces existing)."),
  }),
  z.object({
    type: z.literal("addSlide"),
    insertAtIndex: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Zero-based index where the new slide should be inserted. If omitted, the slide is appended."
      ),
  }),
  z.object({
    type: z.literal("deleteSlide"),
    slideNumber: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("addTextBox"),
    slideNumber: z.number().int().positive(),
    text: z.string(),
  }),
  z.object({
    type: z.literal("deleteElement"),
    slideNumber: z.number().int().positive(),
    contains: z
      .string()
      .describe(
        "A snippet of the text content of the element to delete. The first element on the slide whose text contains this snippet will be deleted."
      ),
  }),
  z.object({
    type: z.literal("raw"),
    request: z
      .record(z.string(), z.any())
      .describe(
        "Raw Google Slides batchUpdate request object. Escape hatch when no lean operation covers your need."
      ),
  }),
]);

export type PresentationOperation = z.infer<typeof PresentationOperationSchema>;
type ShapeIdentifier = z.infer<typeof ShapeIdentifierSchema>;

export const PresentationOperationsArraySchema = z.array(
  PresentationOperationSchema
);

function getSlideByNumber(
  presentation: slides_v1.Schema$Presentation,
  slideNumber: number
): slides_v1.Schema$Page | null {
  const slides = presentation.slides ?? [];
  const idx = slideNumber - 1;
  if (idx < 0 || idx >= slides.length) {
    return null;
  }
  return slides[idx];
}

function getShapeText(shape: slides_v1.Schema$Shape | undefined): string {
  if (!shape?.text?.textElements) {
    return "";
  }
  let out = "";
  for (const te of shape.text.textElements) {
    if (te.textRun?.content) {
      out += te.textRun.content;
    }
  }
  return out;
}

function extractElementText(element: slides_v1.Schema$PageElement): string {
  let out = getShapeText(element.shape);
  if (element.table?.tableRows) {
    for (const row of element.table.tableRows) {
      for (const cell of row.tableCells ?? []) {
        for (const te of cell.text?.textElements ?? []) {
          if (te.textRun?.content) {
            out += te.textRun.content;
          }
        }
      }
    }
  }
  return out;
}

function findElementOnSlide(
  slide: slides_v1.Schema$Page,
  contains: string
): slides_v1.Schema$PageElement | null {
  for (const element of slide.pageElements ?? []) {
    const text = extractElementText(element);
    if (text.includes(contains)) {
      return element;
    }
  }
  return null;
}

/**
 * Walks a slide's pageElements (including grouped children) and yields every
 * shape with its objectId. Grouped elements are traversed so that
 * {byIndex, byType, byText} can find shapes nested in groups, matching the
 * spec's requirement for recursive group resolution.
 */
function* iterShapes(slide: slides_v1.Schema$Page): Generator<{
  objectId: string;
  shape: slides_v1.Schema$Shape;
  element: slides_v1.Schema$PageElement;
}> {
  const queue: slides_v1.Schema$PageElement[] = [...(slide.pageElements ?? [])];
  while (queue.length > 0) {
    const element = queue.shift();
    if (!element) {
      continue;
    }
    if (element.shape && element.objectId) {
      yield {
        objectId: element.objectId,
        shape: element.shape,
        element,
      };
    }
    if (element.elementGroup?.children) {
      queue.push(...element.elementGroup.children);
    }
  }
}

type ResolvedShape = {
  objectId: string;
  shape: slides_v1.Schema$Shape;
};

function resolveShape(
  slide: slides_v1.Schema$Page,
  identifier: ShapeIdentifier
): Result<ResolvedShape, Error> {
  const shapes = Array.from(iterShapes(slide));
  if ("byText" in identifier) {
    const match = shapes.find(({ shape }) =>
      getShapeText(shape).includes(identifier.byText)
    );
    if (!match) {
      return new Err(
        new Error(
          `No shape containing text "${identifier.byText}" found on the slide.`
        )
      );
    }
    return new Ok({ objectId: match.objectId, shape: match.shape });
  }
  if ("byIndex" in identifier) {
    if (identifier.byIndex >= shapes.length) {
      return new Err(
        new Error(
          `Shape index ${identifier.byIndex} out of range (slide has ${shapes.length} shape(s)).`
        )
      );
    }
    const hit = shapes[identifier.byIndex];
    return new Ok({ objectId: hit.objectId, shape: hit.shape });
  }
  if ("byType" in identifier) {
    const wanted = identifier.byType;
    const match = shapes.find(({ shape }) => {
      if (wanted === "TEXT_BOX") {
        return shape.shapeType === "TEXT_BOX";
      }
      return shape.placeholder?.type === wanted;
    });
    if (!match) {
      return new Err(new Error(`No ${wanted} shape found on the slide.`));
    }
    return new Ok({ objectId: match.objectId, shape: match.shape });
  }
  return new Err(new Error("Invalid shape identifier."));
}

function getShapeTextLength(shape: slides_v1.Schema$Shape): number {
  return getShapeText(shape).length;
}

function findTableOnSlide(
  slide: slides_v1.Schema$Page,
  tableIndex: number
): Result<{ objectId: string }, Error> {
  let seen = 0;
  for (const element of slide.pageElements ?? []) {
    if (element.table && element.objectId) {
      if (seen === tableIndex) {
        return new Ok({ objectId: element.objectId });
      }
      seen += 1;
    }
  }
  return new Err(
    new Error(
      `Table index ${tableIndex} out of range on the slide (${seen} table(s) found).`
    )
  );
}

function resolveSlideNumbersToObjectIds(
  presentation: slides_v1.Schema$Presentation,
  slideNumbers: number[]
): Result<string[], Error> {
  const ids: string[] = [];
  for (const n of slideNumbers) {
    const slide = getSlideByNumber(presentation, n);
    if (!slide || !slide.objectId) {
      return new Err(new Error(`Slide ${n} not found.`));
    }
    ids.push(slide.objectId);
  }
  return new Ok(ids);
}

export function resolvePresentationOperations(
  presentation: slides_v1.Schema$Presentation,
  operations: PresentationOperation[]
): Result<slides_v1.Schema$Request[], Error> {
  const requests: slides_v1.Schema$Request[] = [];

  for (const op of operations) {
    switch (op.type) {
      case "replaceAllText": {
        const req: slides_v1.Schema$ReplaceAllTextRequest = {
          containsText: { text: op.find, matchCase: op.matchCase ?? false },
          replaceText: op.replace,
        };
        if (op.slideNumbers && op.slideNumbers.length > 0) {
          const idsResult = resolveSlideNumbersToObjectIds(
            presentation,
            op.slideNumbers
          );
          if (idsResult.isErr()) {
            return new Err(
              new Error(`replaceAllText: ${idsResult.error.message}`)
            );
          }
          req.pageObjectIds = idsResult.value;
        }
        requests.push({ replaceAllText: req });
        break;
      }
      case "replaceShapeText": {
        const slide = getSlideByNumber(presentation, op.slideNumber);
        if (!slide || !slide.objectId) {
          return new Err(
            new Error(`replaceShapeText: slide ${op.slideNumber} not found.`)
          );
        }
        const shapeResult = resolveShape(slide, op.shapeIdentifier);
        if (shapeResult.isErr()) {
          return new Err(
            new Error(`replaceShapeText: ${shapeResult.error.message}`)
          );
        }
        const { objectId, shape } = shapeResult.value;
        if (getShapeTextLength(shape) > 0) {
          requests.push({
            deleteText: { objectId, textRange: { type: "ALL" } },
          });
        }
        requests.push({
          insertText: { objectId, text: op.content, insertionIndex: 0 },
        });
        break;
      }
      case "insertInShape": {
        const slide = getSlideByNumber(presentation, op.slideNumber);
        if (!slide || !slide.objectId) {
          return new Err(
            new Error(`insertInShape: slide ${op.slideNumber} not found.`)
          );
        }
        const shapeResult = resolveShape(slide, op.shapeIdentifier);
        if (shapeResult.isErr()) {
          return new Err(
            new Error(`insertInShape: ${shapeResult.error.message}`)
          );
        }
        const { objectId, shape } = shapeResult.value;
        const insertionIndex =
          op.position === "end" ? getShapeTextLength(shape) : 0;
        requests.push({
          insertText: { objectId, text: op.content, insertionIndex },
        });
        break;
      }
      case "replaceSlideTableCell": {
        const slide = getSlideByNumber(presentation, op.slideNumber);
        if (!slide || !slide.objectId) {
          return new Err(
            new Error(
              `replaceSlideTableCell: slide ${op.slideNumber} not found.`
            )
          );
        }
        const tableResult = findTableOnSlide(slide, op.tableIndex);
        if (tableResult.isErr()) {
          return new Err(
            new Error(`replaceSlideTableCell: ${tableResult.error.message}`)
          );
        }
        const { objectId } = tableResult.value;
        const cellLocation = {
          rowIndex: op.rowIndex,
          columnIndex: op.columnIndex,
        };
        // Always issue the delete; the Slides API tolerates deleting from an
        // empty cell (no-op) and we'd otherwise need a second walk to check.
        requests.push({
          deleteText: {
            objectId,
            cellLocation,
            textRange: { type: "ALL" },
          },
        });
        requests.push({
          insertText: {
            objectId,
            cellLocation,
            text: op.content,
            insertionIndex: 0,
          },
        });
        break;
      }
      case "replaceNotes": {
        const slide = getSlideByNumber(presentation, op.slideNumber);
        if (!slide || !slide.objectId) {
          return new Err(
            new Error(`replaceNotes: slide ${op.slideNumber} not found.`)
          );
        }
        const notesObjectId =
          slide.slideProperties?.notesPage?.notesProperties
            ?.speakerNotesObjectId;
        if (!notesObjectId) {
          return new Err(
            new Error(
              `replaceNotes: slide ${op.slideNumber} has no speaker notes shape.`
            )
          );
        }
        requests.push({
          deleteText: {
            objectId: notesObjectId,
            textRange: { type: "ALL" },
          },
        });
        requests.push({
          insertText: {
            objectId: notesObjectId,
            text: op.content,
            insertionIndex: 0,
          },
        });
        break;
      }
      case "addSlide": {
        requests.push({
          createSlide: {
            ...(op.insertAtIndex !== undefined
              ? { insertionIndex: op.insertAtIndex }
              : {}),
          },
        });
        break;
      }
      case "deleteSlide": {
        const slide = getSlideByNumber(presentation, op.slideNumber);
        if (!slide || !slide.objectId) {
          return new Err(
            new Error(`deleteSlide: slide ${op.slideNumber} not found.`)
          );
        }
        requests.push({
          deleteObject: { objectId: slide.objectId },
        });
        break;
      }
      case "addTextBox": {
        const slide = getSlideByNumber(presentation, op.slideNumber);
        if (!slide || !slide.objectId) {
          return new Err(
            new Error(`addTextBox: slide ${op.slideNumber} not found.`)
          );
        }
        const elementId = `dust_textbox_${crypto.randomUUID()}`;
        requests.push({
          createShape: {
            objectId: elementId,
            shapeType: "TEXT_BOX",
            elementProperties: {
              pageObjectId: slide.objectId,
              size: {
                width: {
                  magnitude: TEXTBOX_DEFAULT_WIDTH_EMU,
                  unit: "EMU",
                },
                height: {
                  magnitude: TEXTBOX_DEFAULT_HEIGHT_EMU,
                  unit: "EMU",
                },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: TEXTBOX_DEFAULT_OFFSET_EMU,
                translateY: TEXTBOX_DEFAULT_OFFSET_EMU,
                unit: "EMU",
              },
            },
          },
        });
        requests.push({
          insertText: {
            objectId: elementId,
            text: op.text,
            insertionIndex: 0,
          },
        });
        break;
      }
      case "deleteElement": {
        const slide = getSlideByNumber(presentation, op.slideNumber);
        if (!slide || !slide.objectId) {
          return new Err(
            new Error(`deleteElement: slide ${op.slideNumber} not found.`)
          );
        }
        const element = findElementOnSlide(slide, op.contains);
        if (!element || !element.objectId) {
          return new Err(
            new Error(
              `deleteElement: no element on slide ${op.slideNumber} matched "${op.contains}".`
            )
          );
        }
        requests.push({
          deleteObject: { objectId: element.objectId },
        });
        break;
      }
      case "raw": {
        // Escape hatch: caller takes responsibility for the request shape; the
        // googleapis Schema$Request type is too wide to typeguard usefully.
        requests.push(op.request as slides_v1.Schema$Request);
        break;
      }
      default:
        assertNever(op);
    }
  }

  return new Ok(requests);
}
