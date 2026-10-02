import {
  isValidId,
  parseAttributes,
  requiredString,
} from "@app/lib/markdown/dfm/grammar";
import type { Range } from "@app/lib/markdown/dfm/parser";
import {
  checkInputBounds,
  codeRanges,
  isEscaped,
} from "@app/lib/markdown/dfm/parser";
import type { DfmAnchor, DfmError } from "@app/lib/markdown/dfm/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

/**
 * Comment anchors in the body: `:comment-start{id=x}` ... `:comment-end{id=x}` pairs around
 * the commented text. Anchor syntax inside code is left alone. Editing operations on anchors
 * live in operations.ts.
 */

/** `:comment-start{...}` or `:comment-end{...}`, capturing the attributes; absent when malformed. */
const ANCHOR_PATTERN = /:comment-(start|end)(?![\w-])(?:\{([^}\n]*)\})?/g;

const anchorAttributesSchema = z
  .object({
    id: requiredString("Comment anchor without a valid id.").refine(
      isValidId,
      "Comment anchor without a valid id."
    ),
  })
  .strict();

export function anchorDirective(kind: "start" | "end", id: string): string {
  return `:comment-${kind}{id=${id}}`;
}

interface ScannedAnchor extends DfmAnchor {
  /** Line of the start directive, 1-based, offset by the caller. */
  line: number;
}

/** An anchor directive removed from the body, by its position in the body and in the text. */
export interface AnchorMarker {
  bodyIndex: number;
  length: number;
  textOffset: number;
}

export interface AnchorScan {
  /** The body without its anchor directives. */
  text: string;
  /** In document order: by start, then by end. */
  anchors: ScannedAnchor[];
  markers: AnchorMarker[];
}

interface AnchorMatch {
  index: number;
  length: number;
  kind: string;
  /** The attributes between the braces, or undefined when the braces are malformed. */
  attributes: string | undefined;
}

/** The regions of the body outside code, in order. */
function textRegions(body: string): Range[] {
  const regions: Range[] = [];
  let cursor = 0;
  for (const range of codeRanges(body)) {
    if (range.start > cursor) {
      regions.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < body.length) {
    regions.push({ start: cursor, end: body.length });
  }
  return regions;
}

/**
 * Anchor directives outside code, in order. Each region is matched on its own so a directive
 * cannot start inside code and swallow text past it, nor start in text and reach into code. A
 * directive behind a backslash is escaped text, as any Markdown parser reads it.
 */
function* anchorMatches(body: string): Generator<AnchorMatch> {
  for (const region of textRegions(body)) {
    const slice = body.slice(region.start, region.end);
    for (const match of slice.matchAll(ANCHOR_PATTERN)) {
      const index = region.start + match.index;
      if (isEscaped(body, index)) {
        continue;
      }
      yield {
        index,
        length: match[0].length,
        kind: match[1],
        attributes: match[2],
      };
    }
  }
}

/**
 * Walks the body once, stripping anchor directives outside code and pairing them. `lineOffset`
 * is the number of source lines before the body, so reported lines are source lines.
 */
export function scanAnchors(
  body: string,
  lineOffset: number
): Result<AnchorScan, DfmError> {
  const anchors: ScannedAnchor[] = [];
  const markers: AnchorMarker[] = [];
  const open = new Map<string, { start: number; line: number }>();
  const closed = new Set<string>();
  let text = "";
  let last = 0;
  let line = lineOffset + 1;

  const bounds = checkInputBounds(body);
  if (bounds) {
    return new Err(
      bounds.line === undefined
        ? bounds
        : { ...bounds, line: bounds.line + lineOffset }
    );
  }

  for (const { index, attributes: raw, kind, length } of anchorMatches(body)) {
    const gap = body.slice(last, index);
    for (const character of gap) {
      if (character === "\n") {
        line++;
      }
    }
    text += gap;
    last = index + length;

    if (raw === undefined) {
      return new Err({ message: "Malformed comment anchor.", line });
    }
    const attributes = parseAttributes(raw, anchorAttributesSchema);
    if (attributes.isErr()) {
      return new Err({ message: attributes.error, line });
    }
    const { id } = attributes.value;
    markers.push({ bodyIndex: index, length, textOffset: text.length });

    if (kind === "start") {
      if (open.has(id) || closed.has(id)) {
        return new Err({ message: `Duplicate comment anchor "${id}".`, line });
      }
      open.set(id, { start: text.length, line });
    } else {
      const started = open.get(id);
      if (started === undefined) {
        return new Err({
          message: `Comment anchor "${id}" ends before it starts.`,
          line,
        });
      }
      if (started.start === text.length) {
        return new Err({
          message: `Comment anchor "${id}" covers no text.`,
          line,
        });
      }
      anchors.push({
        id,
        start: started.start,
        end: text.length,
        line: started.line,
      });
      open.delete(id);
      closed.add(id);
    }
  }
  text += body.slice(last);

  const unclosed = open.entries().next();
  if (!unclosed.done) {
    const [id, started] = unclosed.value;
    return new Err({
      message: `Comment anchor "${id}" is never closed.`,
      line: started.line,
    });
  }

  anchors.sort((a, b) => a.start - b.start || a.end - b.end);
  return new Ok({ text, anchors, markers });
}

/**
 * @cc [owner:PopDaph,label:product] dfm-anchor-integrity
 * Every anchor id MUST have exactly one start and one end directive, the start before the end,
 * covering at least one character. Anchors MAY overlap and MUST be returned in document order,
 * by start then by end. Anchor syntax inside fenced code or inside a code span, including one
 * crossing a line break within a paragraph, or behind a backslash escape, MUST be treated as
 * text. A violation MUST fail the whole call.
 */
export function extractAnchors(
  body: string
): Result<{ text: string; anchors: DfmAnchor[] }, DfmError> {
  const scanned = scanAnchors(body, 0);
  if (scanned.isErr()) {
    return scanned;
  }
  return new Ok({
    text: scanned.value.text,
    anchors: scanned.value.anchors.map(({ id, start, end }) => ({
      id,
      start,
      end,
    })),
  });
}
