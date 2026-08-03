// Ported to front/lib/api/viz/extract_file_refs.ts — keep `isScopedPath` in sync with
// `isAgentScopedPath` in front/lib/api/files/mount_path.ts until deduped into a shared package.
import logger from "@viz/app/lib/logger";
import ts from "typescript";

export type FileRef =
  | { type: "fileId"; fileId: string }
  | { type: "path"; scopedPath: string };

// Mirrors front's `parseRawVizScope` contract. Canonical scopes are `${PREFIX}-{id}/...`;
// the bare prefixes are legacy forms still emitted by older frame code.
const SCOPED_PREFIX_CONVERSATION = "conversation";
const SCOPED_PREFIX_POD = "pod";
const SCOPED_PREFIX_PROJECT = "project";

function isScopedPath(value: string): boolean {
  const slashIdx = value.indexOf("/");
  if (slashIdx <= 0) {
    return false;
  }
  const prefix = value.slice(0, slashIdx);

  // Canonical, portable scopes are what frame code is instructed to use, e.g.
  // `conversation-{conversationId}/report.csv` or `pod-{podId}/notes.md`. This mirrors the
  // server contract in front's `parseRawVizScope`: the id after the prefix must be non-empty.
  if (
    prefix.startsWith(`${SCOPED_PREFIX_CONVERSATION}-`) ||
    prefix.startsWith(`${SCOPED_PREFIX_POD}-`)
  ) {
    return !prefix.endsWith("-");
  }

  // Legacy bare prefixes, still used by older frame code.
  return (
    prefix === SCOPED_PREFIX_CONVERSATION ||
    prefix === SCOPED_PREFIX_POD ||
    prefix === SCOPED_PREFIX_PROJECT
  );
}

export function extractFileRefs(code: string): FileRef[] {
  const refs = new Map<string, FileRef>();

  const add = (value: string) => {
    if (refs.has(value)) {
      return;
    }

    if (/^fil_[a-zA-Z0-9]{10,}$/.test(value)) {
      refs.set(value, { type: "fileId", fileId: value });
    } else if (isScopedPath(value)) {
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
