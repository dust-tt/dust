import type { AnchorMarker } from "@app/lib/markdown/dfm/anchors";
import { anchorDirective, scanAnchors } from "@app/lib/markdown/dfm/anchors";
import { isValidId } from "@app/lib/markdown/dfm/grammar";
import type { Range } from "@app/lib/markdown/dfm/parser";
import {
  codeRanges,
  endsInsideFence,
  isEscaped,
  structure,
} from "@app/lib/markdown/dfm/parser";
import type { DfmError } from "@app/lib/markdown/dfm/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import isEqual from "lodash/isEqual";

/**
 * Editing operations on a body, for callers that work with quoted words rather than offsets,
 * such as agent tools. Each operation returns the new body or the reason it was refused.
 */

/** The body's code regions as offsets into its anchor-free text, so two bodies compare. */
function codeRangesInText(body: string, markers: AnchorMarker[]): Range[] {
  // Ranges and markers are both in body order, so one cursor converts every endpoint.
  let next = 0;
  let removed = 0;
  const toText = (index: number) => {
    while (
      next < markers.length &&
      markers[next].bodyIndex + markers[next].length <= index
    ) {
      removed += markers[next].length;
      next++;
    }
    return index - removed;
  };
  return codeRanges(body).map((range) => ({
    start: toText(range.start),
    end: toText(range.end),
  }));
}

/** Index of the nth occurrence of `quote`, occurrences not overlapping, so one pass over the text. */
function nthIndexOf(text: string, quote: string, nth: number): number {
  let index = -quote.length;
  for (let i = 0; i < nth; i++) {
    index = text.indexOf(quote, index + quote.length);
    if (index === -1) {
      return -1;
    }
  }
  return index;
}

/**
 * @cc [owner:PopDaph,label:product] dfm-anchor-by-quote
 * anchorComment MUST wrap exactly the nth non-overlapping occurrence of `quote` in the body's
 * anchor-free text
 * with a start and an end anchor for `id`, and MUST NOT change any other character, which text
 * is code, any other anchor, or the body's Markdown structure (its parse tree, text nodes
 * aside). It MUST fail when the quote is empty, `nth` is not a positive integer, the quote
 * occurs fewer than nth times, overlaps code, or starts or ends right after a backslash, when
 * `id` already anchors a comment, or when the body contains a carriage return or ends inside a
 * code fence.
 */
export function anchorComment({
  body,
  id,
  quote,
  nth = 1,
}: {
  body: string;
  id: string;
  quote: string;
  nth?: number;
}): Result<string, DfmError> {
  if (!isValidId(id)) {
    return new Err({ message: `Invalid comment id "${id}".` });
  }
  if (quote === "") {
    return new Err({ message: "Quote cannot be empty." });
  }
  if (!Number.isInteger(nth) || nth < 1) {
    return new Err({ message: "Occurrence must be a positive integer." });
  }
  if (body.includes("\r")) {
    return new Err({ message: "Body cannot contain a carriage return." });
  }
  if (endsInsideFence(body)) {
    return new Err({ message: "Body ends inside a code fence." });
  }
  const scanned = scanAnchors(body, 0);
  if (scanned.isErr()) {
    return scanned;
  }
  const { text, anchors, markers } = scanned.value;
  if (anchors.some((anchor) => anchor.id === id)) {
    return new Err({ message: `Comment anchor "${id}" already exists.` });
  }
  const start = nthIndexOf(text, quote, nth);
  if (start === -1) {
    return new Err({
      message: `Quote not found${nth > 1 ? ` ${nth} times` : ""} in the body.`,
    });
  }
  const end = start + quote.length;
  const insideCode = { message: "Quote cannot be anchored inside code." };
  if (
    codeRanges(text).some((range) => range.start < end && start < range.end)
  ) {
    return new Err(insideCode);
  }

  // A text offset maps to the body offset before any anchor directive standing there.
  const toBodyIndex = (textOffset: number) =>
    markers.reduce(
      (index, marker) =>
        marker.textOffset < textOffset ? index + marker.length : index,
      textOffset
    );
  const startIndex = toBodyIndex(start);
  const endIndex = toBodyIndex(end);
  if (isEscaped(body, startIndex) || isEscaped(body, endIndex)) {
    return new Err({
      message: "Quote cannot start or end right after a backslash.",
    });
  }
  const anchored =
    body.slice(0, startIndex) +
    anchorDirective("start", id) +
    body.slice(startIndex, endIndex) +
    anchorDirective("end", id) +
    body.slice(endIndex);

  // Re-scanning is the one check that cannot drift from the parser. The body was valid, so any
  // failure here comes from the insertion: it created or broke a code span. The anchor-free
  // text and the other anchors must be exactly what they were, or an anchor went inert.
  const check = scanAnchors(anchored, 0);
  if (check.isErr() || check.value.text !== text) {
    return new Err(insideCode);
  }
  const anchor = check.value.anchors.find((candidate) => candidate.id === id);
  const others = check.value.anchors.filter((candidate) => candidate.id !== id);
  if (
    anchor === undefined ||
    check.value.text.slice(anchor.start, anchor.end) !== quote ||
    others.length !== anchors.length ||
    others.some(
      (candidate, i) =>
        candidate.id !== anchors[i].id ||
        candidate.start !== anchors[i].start ||
        candidate.end !== anchors[i].end
    )
  ) {
    return new Err(insideCode);
  }
  // A marker can also unescape a backtick and create a span around unchanged text.
  if (
    !isEqual(
      codeRangesInText(body, markers),
      codeRangesInText(anchored, check.value.markers)
    )
  ) {
    return new Err(insideCode);
  }
  // A marker at the start of a line can also demote a heading, a list item or a quote to a
  // paragraph, and one next to an emphasis delimiter can break it. The parser is the judge.
  const before = structure(body);
  const after = structure(anchored);
  const changed = before.findIndex((type, i) => type !== after[i]);
  if (changed !== -1 || after.length !== before.length) {
    const was = before[changed]?.split(":")[1] ?? "nothing";
    const became = after[changed]?.split(":")[1] ?? "nothing";
    return new Err({
      message: `Quote cannot be anchored without changing the document structure: ${was} would become ${became}. Quote the text without its Markdown syntax.`,
    });
  }

  return new Ok(anchored);
}
