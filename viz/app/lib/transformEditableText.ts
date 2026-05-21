import logger from "@viz/app/lib/logger";
import ts from "typescript";

interface JSXTextReplacement {
  ctxAfter: string;
  ctxBefore: string;
  end: number;
  rawText: string;
  start: number;
}

// Characters of surrounding source stored in each span so the server can do a unique string match
// even when the same visible text appears multiple times in the file (e.g. repeated table labels).
const CONTEXT_CHARS = 60;

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
        const { pos, end } = node;
        replacements.push({
          start: pos,
          end,
          rawText: code.slice(pos, end),
          ctxBefore: code.slice(Math.max(0, pos - CONTEXT_CHARS), pos),
          ctxAfter: code.slice(end, Math.min(code.length, end + CONTEXT_CHARS)),
        });
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
  for (const { start, end, rawText, ctxBefore, ctxAfter } of replacements) {
    result =
      result.slice(0, start) +
      [
        `<span`,
        `data-editable="true"`,
        `data-raw-text="${encodeURIComponent(rawText)}"`,
        `data-ctx-before="${encodeURIComponent(ctxBefore)}"`,
        `data-ctx-after="${encodeURIComponent(ctxAfter)}"`,
        `className="cursor-text rounded-sm"`,
        `>`,
      ].join(" ") +
      rawText.trim() +
      `</span>` +
      result.slice(end);
  }

  return result;
}
