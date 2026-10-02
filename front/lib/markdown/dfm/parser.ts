import type { DfmError } from "@app/lib/markdown/dfm/types";
import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";

/**
 * What the codec asks a real Markdown parser: where code is, and what the block structure
 * is. CommonMark decides both before inline syntax, so neither can be read off the text by a
 * scanner. The body itself stays opaque: nothing here interprets it beyond those two answers.
 */

export interface Range {
  start: number;
  end: number;
}

/**
 * Bounds checked before any text reaches the parser. micromark is superlinear on three shapes:
 * a single line of nested containers, and documents made of emphasis delimiters or unclosed
 * link openers, both quadratic in their count. Within these bounds one parse stays around a
 * second on a laptop; beyond them it reaches minutes. Callers on a request path still own
 * their latency: these bounds make the worst case finite, not small.
 */
export const INPUT_LIMITS = {
  /** UTF-16 code units of a body or whole source: half the file write limit. */
  length: 256 * 1024,
  /** Leading spaces, tabs and `>` on one line: the nesting depth of blockquotes and lists. */
  linePrefix: 256,
  /** `*`, `_`, `[` and backtick characters in the text, which drive emphasis and link resolution. */
  delimiters: 15_000,
} as const;

const LINE_PREFIX_PATTERN = /^[ \t>]*/;

/** The reason `text` is out of bounds for the parser, or null. Linear in the text. */
export function checkInputBounds(text: string): DfmError | null {
  if (text.length > INPUT_LIMITS.length) {
    return {
      message: `Text exceeds ${INPUT_LIMITS.length} characters.`,
    };
  }
  let delimiters = 0;
  for (const character of text) {
    if (
      character === "*" ||
      character === "_" ||
      character === "[" ||
      character === "`"
    ) {
      delimiters++;
    }
  }
  if (delimiters > INPUT_LIMITS.delimiters) {
    return {
      message: `Text has more than ${INPUT_LIMITS.delimiters} emphasis, link or code delimiters.`,
    };
  }
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    const prefix = LINE_PREFIX_PATTERN.exec(line);
    if (prefix !== null && prefix[0].length > INPUT_LIMITS.linePrefix) {
      return {
        message: `Line nests deeper than ${INPUT_LIMITS.linePrefix} characters of quotes or indentation.`,
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

/**
 * Character ranges of code blocks and code spans in `text`, in order: fenced and indented
 * blocks, including inside blockquotes and lists, and inline spans wherever CommonMark places
 * them.
 */
export function codeRanges(text: string): Range[] {
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
 * The node types of `text` with their depth, in document order, text nodes aside. Inserting
 * plain text into a body splits or merges text nodes and nothing else, so two bodies with
 * equal structures render the same way around the insertion.
 */
export function structure(text: string): string[] {
  const types: string[] = [];
  for (const { node, depth } of nodes(text)) {
    if (node.type !== "text") {
      types.push(`${depth}:${node.type}`);
    }
  }
  return types;
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
