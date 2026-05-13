import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { slides_v1 } from "googleapis";
import { z } from "zod";

// Slides API sizes/positions are in EMU (English Metric Units). 914_400 EMU = 1 inch.
const TEXTBOX_DEFAULT_WIDTH_EMU = 3_000_000; // ~3.28in
const TEXTBOX_DEFAULT_HEIGHT_EMU = 1_000_000; // ~1.09in
const TEXTBOX_DEFAULT_OFFSET_EMU = 500_000; // ~0.55in from top-left of slide

export const PresentationOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replaceAllText"),
    find: z.string(),
    replace: z.string(),
    matchCase: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("replaceTextInShape"),
    slideNumber: z
      .number()
      .int()
      .positive()
      .describe("1-indexed slide number."),
    find: z.string(),
    replace: z.string(),
    matchCase: z.boolean().optional(),
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

function extractElementText(element: slides_v1.Schema$PageElement): string {
  const parts: string[] = [];
  const textElements = element.shape?.text?.textElements ?? [];
  for (const te of textElements) {
    if (te.textRun?.content) {
      parts.push(te.textRun.content);
    }
  }
  if (element.table?.tableRows) {
    for (const row of element.table.tableRows) {
      for (const cell of row.tableCells ?? []) {
        for (const te of cell.text?.textElements ?? []) {
          if (te.textRun?.content) {
            parts.push(te.textRun.content);
          }
        }
      }
    }
  }
  return parts.join("");
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

export function resolvePresentationOperations(
  presentation: slides_v1.Schema$Presentation,
  operations: PresentationOperation[]
): Result<slides_v1.Schema$Request[], Error> {
  const requests: slides_v1.Schema$Request[] = [];

  for (const op of operations) {
    switch (op.type) {
      case "replaceAllText": {
        requests.push({
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
      case "replaceTextInShape": {
        const slide = getSlideByNumber(presentation, op.slideNumber);
        if (!slide || !slide.objectId) {
          return new Err(
            new Error(`replaceTextInShape: slide ${op.slideNumber} not found.`)
          );
        }
        requests.push({
          replaceAllText: {
            containsText: {
              text: op.find,
              matchCase: op.matchCase ?? false,
            },
            replaceText: op.replace,
            pageObjectIds: [slide.objectId],
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
