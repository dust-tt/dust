import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import ts from "typescript";

export type EditSourceTextErrorCode = "parse_failed" | "text_not_found";

export class EditSourceTextError extends Error {
  constructor(
    readonly code: EditSourceTextErrorCode,
    message: string
  ) {
    super(message);
    this.name = "EditSourceTextError";
  }
}

/**
 * A source location addressing a JSX element, as carried by the `data-source` attribute the
 * bundler stamps on every element (see `injectSourceLocationTags`): `<relPath>:<line>:<col>`,
 * all 1-based, where (line, col) point at the element's tag-name start.
 */
export interface SourceLocation {
  relPath: string;
  line: number;
  col: number;
}

/**
 * Parse a `data-source` value (`<relPath>:<line>:<col>`) into its parts. Returns null when the
 * value is malformed. Paths never contain `:`, so the two trailing numeric segments are
 * unambiguously the line and column.
 */
export function parseSourceLocation(value: string): SourceLocation | null {
  const match = /^(.+):(\d+):(\d+)$/.exec(value);
  if (!match) {
    return null;
  }

  const line = Number(match[2]);
  const col = Number(match[3]);
  if (line < 1 || col < 1) {
    return null;
  }

  return { relPath: match[1], line, col };
}

/**
 * Replace a JSX text node's visible text, matching by content with the clicked location as a
 * tiebreaker.
 *
 * This is the write-back half of location-based live edit: a human double-clicks rendered text,
 * the viz runtime reads the clicked element's `data-source="<file>:<line>:<col>"`, and the edit
 * is routed back to the SOURCE file (not matched against the rendered bytes).
 *
 * Matching strategy, where `oldText` is the primary key and `(line, col)` only disambiguates:
 * - Collect every JSX text node whose visible (trimmed) text equals `oldText`.
 * - Exactly one match: edit it. The position is irrelevant, so this is immune to position drift
 *   from prior edits (the bundle's tags are stamped at publish time and never refreshed in the
 *   iframe, so they go stale as edits accumulate).
 * - Several matches (the same text appears more than once): pick the one whose element's tag is
 *   nearest the clicked `(line, col)`. This keeps the duplicate-text immunity the location
 *   approach was built for, and tolerates small drift (a few columns/lines) since the true target
 *   is still the closest. Heavily drifted duplicates on the same line remain the one weak spot,
 *   and re-rendering the iframe after an edit (to refresh tags) would close it entirely.
 *
 * Implemented as a single string splice over AST positions, so the rest of the source bytes are
 * preserved exactly (no reformatting). Leading/trailing whitespace of the matched node is
 * preserved, and only the visible text is swapped.
 *
 * (line, col) are 1-based and point at the element's tag-name start. `oldText`/`newText` are the
 * visible (trimmed) text.
 */
export function replaceJsxTextAtSourceLocation(
  code: string,
  {
    line,
    col,
    oldText,
    newText,
  }: Omit<SourceLocation, "relPath"> & {
    oldText: string;
    newText: string;
  }
): Result<string, EditSourceTextError> {
  let sourceFile: ts.SourceFile;

  try {
    sourceFile = ts.createSourceFile(
      "frame.tsx",
      code,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TSX
    );
  } catch (err) {
    return new Err(
      new EditSourceTextError("parse_failed", normalizeError(err).message)
    );
  }

  const trimmedOld = oldText.trim();
  if (trimmedOld.length === 0) {
    return new Err(
      new EditSourceTextError("text_not_found", "oldText is empty.")
    );
  }

  // Collect every JSX text node whose visible text matches.
  const candidates: ts.JsxText[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxText(node) &&
      code.slice(node.pos, node.end).trim() === trimmedOld
    ) {
      candidates.push(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (candidates.length === 0) {
    return new Err(
      new EditSourceTextError(
        "text_not_found",
        `No text "${trimmedOld}" found.`
      )
    );
  }

  let target: ts.JsxText;
  if (candidates.length === 1) {
    target = candidates[0];
  } else {
    // Duplicate text: disambiguate by the clicked element's location. Use the containing
    // element's tag-name start (what the `data-source` position addresses) as the reference.
    let targetPos = -1;
    try {
      targetPos = sourceFile.getPositionOfLineAndCharacter(line - 1, col - 1);
    } catch {
      // Out-of-range location (e.g. column drifted past the line end): leave -1, which picks the
      // earliest match.
    }

    const elementStart = (textNode: ts.JsxText): number => {
      const parent = textNode.parent;
      if (parent && ts.isJsxElement(parent)) {
        return parent.openingElement.tagName.getStart(sourceFile);
      }

      return textNode.getStart(sourceFile);
    };

    target = candidates.reduce((best, candidate) =>
      Math.abs(elementStart(candidate) - targetPos) <
      Math.abs(elementStart(best) - targetPos)
        ? candidate
        : best
    );
  }

  const raw = code.slice(target.pos, target.end);
  const idx = raw.indexOf(trimmedOld);

  // Preserve the raw node's surrounding whitespace and swap only the visible text.
  const newRaw =
    raw.slice(0, idx) + newText + raw.slice(idx + trimmedOld.length);

  const updated = code.slice(0, target.pos) + newRaw + code.slice(target.end);

  return new Ok(updated);
}
