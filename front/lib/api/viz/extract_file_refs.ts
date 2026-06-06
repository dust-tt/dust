// Ported from viz/app/lib/parseFileRefs.ts — keep classification in sync with
// `isAgentScopedPath` in front/lib/api/files/mount_path.ts until deduped into a shared package.
import { isAgentScopedPath } from "@app/lib/api/files/mount_path";
import logger from "@app/logger/logger";
import ts from "typescript";

export type FileRef =
  | { type: "fileId"; fileId: string }
  | { type: "path"; scopedPath: string };

export function extractFileRefs(code: string): FileRef[] {
  const refs = new Map<string, FileRef>();

  const add = (value: string) => {
    if (refs.has(value)) {
      return;
    }

    if (/^fil_[a-zA-Z0-9]{10,}$/.test(value)) {
      refs.set(value, { type: "fileId", fileId: value });
    } else if (isAgentScopedPath(value)) {
      refs.set(value, { type: "path", scopedPath: value });
    }
  };

  try {
    // TypeScript's parser is tolerant by design. It produces a (partial) AST even for code with
    // syntax errors (errors are reported via parseDiagnostics rather than thrown), which is what
    // we want for AI-generated frame code.
    const sourceFile = ts.createSourceFile(
      "frame.tsx",
      code,
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TSX
    );

    const visit = (node: ts.Node): void => {
      // Extract useFile("X") calls.
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "useFile" &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        add(node.arguments[0].text);
      }

      // Extract fileId="X" JSX attributes.
      if (
        ts.isJsxAttribute(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "fileId" &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        add(node.initializer.text);
      }

      // Extract fil_xxx / scoped paths from any string literal.
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        add(node.text);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  } catch (err) {
    logger.warn({ err }, "Failed to parse frame code:");
  }

  return Array.from(refs.values());
}
