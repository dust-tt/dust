import logger from "@viz/app/lib/logger";
import ts from "typescript";

interface JSXTextReplacement {
  start: number;
  end: number;
  editId: string;
  rawText: string;
}

/**
 * Transforms JsxText nodes in a Frame's TSX source by wrapping them with
 * `<span data-editable="true" data-edit-id="line:col">…</span>`.
 *
 * Position-based IDs (line:col) allow the host to locate the exact source
 * node when writing back the user's edit, even when the same text appears
 * multiple times.  Whitespace-only JsxText nodes are left untouched.
 */
export function transformEditableText(code: string): string {
  const replacements: JSXTextReplacement[] = [];

  try {
    const sourceFile = ts.createSourceFile(
      "frame.tsx",
      code,
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TSX
    );

    const visit = (node: ts.Node): void => {
      if (ts.isJsxText(node) && node.text.trim() !== "") {
        const start = node.pos;
        const end = node.end;
        const { line, character } = ts.getLineAndCharacterOfPosition(
          sourceFile,
          start
        );
        const editId = `${line + 1}:${character}`;
        replacements.push({ start, end, editId, rawText: code.slice(start, end) });
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
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
  for (const { start, end, editId, rawText } of replacements) {
    result =
      result.slice(0, start) +
      `<span data-editable="true" data-edit-id="${editId}">${rawText}</span>` +
      result.slice(end);
  }

  return result;
}
