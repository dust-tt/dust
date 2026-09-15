import logger from "@viz/app/lib/logger";
import ts from "typescript";

interface JSXTextReplacement {
  ctxAfter: string;
  ctxBefore: string;
  end: number;
  rawText: string;
  start: number;
}

export interface EditableSpanMeta {
  ctxAfter: string;
  ctxBefore: string;
  rawText: string;
}

// Characters of surrounding source stored in each span so the server can do a unique string match
// even when the same visible text appears multiple times in the file (e.g. repeated table labels).
const CONTEXT_CHARS = 60;

const HIGH_SURROGATE_FIRST = 0xd800;
const HIGH_SURROGATE_LAST = 0xdbff;
const LOW_SURROGATE_FIRST = 0xdc00;
const LOW_SURROGATE_LAST = 0xdfff;

function isHighSurrogate(charCode: number): boolean {
  return charCode >= HIGH_SURROGATE_FIRST && charCode <= HIGH_SURROGATE_LAST;
}

function isLowSurrogate(charCode: number): boolean {
  return charCode >= LOW_SURROGATE_FIRST && charCode <= LOW_SURROGATE_LAST;
}

// The context windows are cut at a fixed count of UTF-16 code units, which lands mid-surrogate-pair
// whenever an astral character (an emoji) straddles the cut. encodeURIComponent throws
// `URIError: URI malformed` on a lone surrogate, so shrink the window to the nearest code point
// boundary. One code unit of context is irrelevant to the uniqueness of the match.
function contextStart(code: string, pos: number): number {
  const start = Math.max(0, pos - CONTEXT_CHARS);
  const splitsPair =
    start > 0 &&
    isHighSurrogate(code.charCodeAt(start - 1)) &&
    isLowSurrogate(code.charCodeAt(start));

  return splitsPair ? start + 1 : start;
}

function contextEnd(code: string, pos: number): number {
  const end = Math.min(code.length, pos + CONTEXT_CHARS);
  const splitsPair =
    end > 0 &&
    end < code.length &&
    isHighSurrogate(code.charCodeAt(end - 1)) &&
    isLowSurrogate(code.charCodeAt(end));

  return splitsPair ? end - 1 : end;
}

// Prefix on data-file-id attributes so extractFileRefs skips them (avoids deadlocking the cache).
export const EDITABLE_FILE_ID_PREFIX = "edit:";

function collectJsxTextNodes(code: string): JSXTextReplacement[] {
  const replacements: JSXTextReplacement[] = [];

  const sourceFile = ts.createSourceFile(
    "frame.tsx",
    code,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX
  );

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && node.text.trim() !== "") {
      const { pos, end } = node;
      replacements.push({
        start: pos,
        end,
        rawText: code.slice(pos, end),
        ctxBefore: code.slice(contextStart(code, pos), pos),
        ctxAfter: code.slice(end, contextEnd(code, end)),
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return replacements;
}

// Returns span metadata in document order, used to refresh ctx after an edit without
// re-executing the viz.
export function getEditableSpansMeta(code: string): EditableSpanMeta[] {
  try {
    return collectJsxTextNodes(code).map(
      ({ rawText, ctxBefore, ctxAfter }) => ({
        rawText,
        ctxBefore,
        ctxAfter,
      })
    );
  } catch (err) {
    logger.error({ err }, "Failed to extract editable span metadata");
    return [];
  }
}

// fileId is passed for sub-frames so EditableFrame can route edits to the correct file.
export function transformEditableText(code: string, fileId?: string): string {
  let replacements: JSXTextReplacement[] = [];

  try {
    replacements = collectJsxTextNodes(code);
  } catch (err) {
    logger.error({ err }, "Failed to transform editable text");
    return code;
  }

  if (replacements.length === 0) {
    return code;
  }

  // Apply in reverse order so earlier byte offsets stay valid after each splice.
  replacements.sort((a, b) => b.start - a.start);

  let result = code;
  for (const { start, end, rawText, ctxBefore, ctxAfter } of replacements) {
    const attrs = [
      `<span`,
      `data-editable="true"`,
      `data-raw-text="${encodeURIComponent(rawText)}"`,
      `data-ctx-before="${encodeURIComponent(ctxBefore)}"`,
      `data-ctx-after="${encodeURIComponent(ctxAfter)}"`,
      ...(fileId ? [`data-file-id="${EDITABLE_FILE_ID_PREFIX}${fileId}"`] : []),
      `className="cursor-text rounded-sm"`,
      `>`,
    ];
    result =
      result.slice(0, start) +
      attrs.join(" ") +
      rawText.replace(/^\s*\n\s*/, "").replace(/\s*\n\s*$/, "") +
      `</span>` +
      result.slice(end);
  }

  return result;
}
