import type { DfmError } from "@app/lib/markdown/dfm/types";
import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";

/**
 * What the codec asks a real Markdown parser: where code is, and what the block structure
 * is. CommonMark decides both before inline syntax, so neither can be read off the text by a
 * scanner. The body itself stays opaque: nothing here interprets it beyond those two answers.
 */

export interface Range {
  readonly start: number;
  readonly end: number;
}

/**
 * Bounds checked before any text reaches the parser. micromark is superlinear on four shapes:
 * a single line of nested containers, documents made of emphasis delimiters or of link
 * brackets, both quadratic in their count, and lists, quadratic in their number of items.
 * Within these bounds one parse stays around a second on a laptop; beyond them it reaches
 * minutes. Callers on a request path still own their latency: these bounds make the worst
 * case finite, not small.
 */
export const INPUT_LIMITS = {
  /**
   * UTF-16 code units, not bytes: 256 KB to 768 KB of UTF-8, against the 512 KB file write
   * limit. A cap on linear work, since the slowest linear shape costs about 1.5 s per 256k.
   */
  length: 256 * 1024,
  /** Leading spaces, tabs, `>` and list markers on one line: the nesting depth of containers. */
  linePrefix: 256,
  /** `*`, `_`, `[`, `]` and backtick characters, which drive emphasis and link resolution. */
  delimiters: 15_000,
  /** List markers opening lines, each the start of a list item. */
  listItems: 15_000,
} as const;

/** A list marker, `-`, `+`, `*`, `1.` or `1)`, followed by whitespace or the end of the line. */
const LIST_MARKER = String.raw`(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)`;
/** The containers a line opens before its content: indentation, quotes and list markers. */
const LINE_PREFIX_PATTERN = new RegExp(String.raw`^(?:[ \t>]|${LIST_MARKER})*`);
const LIST_MARKER_PATTERN = new RegExp(LIST_MARKER, "g");

const DELIMITER_PATTERN = /[*_[\]`]/g;
const LINE_ENDING_PATTERN = /\r\n|\r|\n/;

/**
 * The reason `text` is out of bounds for the parser, or null. Linear in the text. Reads the
 * text as the parser does: a leading byte order mark is skipped and `\r`, `\n` and `\r\n` all
 * end a line. A count error names the line where the count crossed its limit. Callers must
 * check the exact string they hand to the parser, not a string it is derived from, since any
 * transformation in between can join what the check saw apart.
 */
export function checkInputBounds(text: string): DfmError | null {
  if (text.length > INPUT_LIMITS.length) {
    return {
      message: `Text exceeds ${INPUT_LIMITS.length} characters.`,
      line: text.slice(0, INPUT_LIMITS.length).split(LINE_ENDING_PATTERN)
        .length,
    };
  }
  let delimiters = 0;
  let listItems = 0;
  const lines = text.replace(/^\uFEFF/, "").split(LINE_ENDING_PATTERN);
  for (const [index, line] of lines.entries()) {
    const prefix = LINE_PREFIX_PATTERN.exec(line)?.[0] ?? "";
    if (prefix.length > INPUT_LIMITS.linePrefix) {
      return {
        message: `Line nests deeper than ${INPUT_LIMITS.linePrefix} characters of quotes, list markers or indentation.`,
        line: index + 1,
      };
    }
    delimiters += line.match(DELIMITER_PATTERN)?.length ?? 0;
    if (delimiters > INPUT_LIMITS.delimiters) {
      return {
        message: `Text has more than ${INPUT_LIMITS.delimiters} emphasis, link or code delimiters.`,
        line: index + 1,
      };
    }
    listItems += prefix.match(LIST_MARKER_PATTERN)?.length ?? 0;
    if (listItems > INPUT_LIMITS.listItems) {
      return {
        message: `Text has more than ${INPUT_LIMITS.listItems} list items.`,
        line: index + 1,
      };
    }
  }
  return null;
}

interface Visit {
  node: Nodes;
  depth: number;
}

/** The parse tree in document order, walked with an explicit stack so depth cannot overflow. */
function* nodes(text: string): Generator<Visit> {
  const stack: Visit[] = [{ node: fromMarkdown(text), depth: 0 }];
  let visit = stack.pop();
  while (visit !== undefined) {
    yield visit;
    const { node, depth } = visit;
    if ("children" in node) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({ node: node.children[i], depth: depth + 1 });
      }
    }
    visit = stack.pop();
  }
}

/** True when the character at `index` is backslash-escaped, as CommonMark reads punctuation. */
export function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  while (index - backslashes > 0 && text[index - backslashes - 1] === "\\") {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function parseCodeRanges(text: string): Range[] {
  const ranges: Range[] = [];
  for (const { node } of nodes(text)) {
    if (node.type !== "code" && node.type !== "inlineCode") {
      continue;
    }
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

// Saving or loading a file asks for the code of its body several times, in between the file
// after its front matter and the body probed for an open fence, each a full parse of the
// document. Comment messages parse in well under a millisecond and would only push those out.
const MEMOIZED_TEXT_MIN_LENGTH = 4096;
const MEMOIZED_TEXTS = 3;
const memoizedCodeRanges: { text: string; ranges: readonly Range[] }[] = [];

/**
 * Character ranges of code blocks and code spans in `text`, in order: fenced and indented
 * blocks, including inside blockquotes and lists, and inline spans wherever CommonMark places
 * them.
 */
export function codeRanges(text: string): readonly Range[] {
  const memoized = memoizedCodeRanges.find((entry) => entry.text === text);
  if (memoized) {
    return memoized.ranges;
  }
  const ranges = parseCodeRanges(text);
  if (text.length >= MEMOIZED_TEXT_MIN_LENGTH) {
    memoizedCodeRanges.unshift({ text, ranges });
    memoizedCodeRanges.splice(MEMOIZED_TEXTS);
  }
  return ranges;
}

/** The top-level code blocks of `text` whose language is `language`, in order. */
export function topLevelCodeBlocks(
  text: string,
  language: string
): (Range & { value: string })[] {
  return fromMarkdown(text).children.flatMap((node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    return node.type === "code" &&
      node.lang === language &&
      start !== undefined &&
      end !== undefined
      ? [{ start, end, value: node.value }]
      : [];
  });
}

/**
 * True when a line at column 0 appended after `text` would land inside an unclosed code fence,
 * as the serializer's next block would. The parser answers: the fence is open when the last
 * code block grows to swallow the probe line.
 */
export function endsInsideFence(text: string): boolean {
  const probe = `${text}\n\nzz`;
  const ranges = codeRanges(probe);
  const last = ranges[ranges.length - 1];
  return last !== undefined && last.end === probe.length;
}

/**
 * The nodes of `text` in document order, text nodes aside, each as its depth, type and own
 * properties (a link's url, a heading's depth, a code block's lang). Inserting plain text into
 * a body splits or merges text nodes and nothing else, so two bodies with equal structures
 * render the same way around the insertion; a change in a property means the insertion landed
 * in Markdown syntax, such as a link destination.
 */
export function structure(text: string): string[] {
  const entries: string[] = [];
  for (const { node, depth } of nodes(text)) {
    if (node.type === "text") {
      continue;
    }
    const properties = Object.entries(node).filter(
      ([key]) => key !== "type" && key !== "position" && key !== "children"
    );
    entries.push(
      `${depth}:${node.type}:${JSON.stringify(Object.fromEntries(properties))}`
    );
  }
  return entries;
}

/** Flags the lines whose first character lies inside code, so a directive there is text. */
export function codeLines(lines: string[]): boolean[] {
  const ranges = codeRanges(lines.join("\n"));
  const inCode: boolean[] = [];
  let offset = 0;
  let rangeIndex = 0;

  for (const line of lines) {
    while (rangeIndex < ranges.length && ranges[rangeIndex].end <= offset) {
      rangeIndex++;
    }
    const range = ranges[rangeIndex];
    inCode.push(
      range !== undefined && range.start <= offset && offset < range.end
    );
    offset += line.length + 1;
  }

  return inCode;
}
