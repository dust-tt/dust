// Ported from viz/app/lib/parseFileRefs.ts — keep classification in sync with
// `isAgentScopedPath` in front/types/mount_path.ts and package-relative helpers in
// `front/lib/api/frames/package_file_ref_paths.ts` until deduped into a shared package.

import {
  formatFramePackageRelativePath,
  parseExtractableFramePackageRelativePath,
} from "@app/lib/api/frames/package_file_ref_paths";
import logger from "@app/logger/logger";
import { isAgentScopedPath } from "@app/types/mount_path";
import ts from "typescript";

export type FileRef =
  | { type: "fileId"; fileId: string }
  | { type: "path"; scopedPath: string }
  | { type: "frameRelative"; relativePath: string };

function isModuleSpecifierLiteral(
  node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral
): boolean {
  const parent = node.parent;
  if (!parent) {
    return false;
  }

  if (
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node
  ) {
    return true;
  }

  if (
    ts.isCallExpression(parent) &&
    parent.arguments[0] === node &&
    ((ts.isIdentifier(parent.expression) &&
      parent.expression.text === "require") ||
      parent.expression.kind === ts.SyntaxKind.ImportKeyword)
  ) {
    return true;
  }

  return false;
}

export function extractFileRefs(code: string): FileRef[] {
  const refs = new Map<string, FileRef>();

  const addFrameRelative = (relativePath: string) => {
    const key = formatFramePackageRelativePath(relativePath);
    if (!refs.has(key)) {
      refs.set(key, { type: "frameRelative", relativePath });
    }
  };

  const addScopedOrFileId = (value: string) => {
    if (refs.has(value)) {
      return;
    }

    if (/^fil_[a-zA-Z0-9]{10,}$/.test(value)) {
      refs.set(value, { type: "fileId", fileId: value });
      return;
    }
    if (isAgentScopedPath(value)) {
      refs.set(value, { type: "path", scopedPath: value });
    }
  };

  try {
    // TypeScript's parser is tolerant by design. It produces a (partial) AST even for code with
    // syntax errors (errors are reported via parseDiagnostics rather than thrown), which is what
    // we want for AI-generated frame code. Parents are required to skip import module specifiers.
    const sourceFile = ts.createSourceFile(
      "frame.tsx",
      code,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ true,
      ts.ScriptKind.TSX
    );

    const visit = (node: ts.Node): void => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        addScopedOrFileId(node.text);

        // Only `./asset.ext` (publish rewrite form). Bare paths and UI copy are ignored.
        if (!isModuleSpecifierLiteral(node)) {
          const relativePath = parseExtractableFramePackageRelativePath(
            node.text
          );
          if (relativePath) {
            addFrameRelative(relativePath);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  } catch (err) {
    logger.warn({ err }, "Failed to parse frame code:");
  }

  return Array.from(refs.values());
}
