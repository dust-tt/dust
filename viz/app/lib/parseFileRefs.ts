// Ported to front/lib/api/viz/extract_file_refs.ts — keep `isScopedPath` / package-relative
// classification in sync with front until deduped into a shared package.
import logger from "@viz/app/lib/logger";
import ts from "typescript";

export type FileRef =
  | { type: "fileId"; fileId: string }
  | { type: "path"; scopedPath: string }
  | { type: "frameRelative"; relativePath: string };

// Mirrors front's `parseRawVizScope` contract. Canonical scopes are `${PREFIX}-{id}/...`;
// the bare prefixes are legacy forms still emitted by older frame code.
const SCOPED_PREFIX_CONVERSATION = "conversation";
const SCOPED_PREFIX_POD = "pod";
const SCOPED_PREFIX_PROJECT = "project";

// Source of truth for supported file extensions is `FILE_FORMATS` /
// `contentTypeFromFileName` in `front/types/files.ts`. Viz cannot import that
// module, so this list is a hand-maintained subset of non-`code` asset
// extensions used to classify package-relative useFile paths. Keep it aligned
// when adding formats there; exclude `cat: "code"` (e.g. .ts/.tsx/.js).
const FRAME_PACKAGE_ASSET_EXTENSIONS = new Set([
  ".csv",
  ".tsv",
  ".json",
  ".dustdoc",
  ".txt",
  ".md",
  ".markdown",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".xml",
  ".yaml",
  ".yml",
  ".html",
  ".htm",
  ".css",
  ".mp3",
  ".mp4",
  ".wav",
  ".webm",
]);

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

function isSafeFrameRelativePath(pathValue: string): boolean {
  if (pathValue.startsWith("/") || pathValue.includes("\\")) {
    return false;
  }
  const segments = pathValue.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== ".."
  );
}

function parseFramePackageRelativePath(value: string): string | null {
  if (
    value.length === 0 ||
    value.trim().startsWith("fil_") ||
    isScopedPath(value) ||
    /^(conversation|pod|project)[-/]/.test(value.trim())
  ) {
    return null;
  }

  const trimmed = value.trim();
  const withoutDot = trimmed.startsWith("./") ? trimmed.slice(2) : trimmed;
  if (!isSafeFrameRelativePath(withoutDot)) {
    return null;
  }
  return withoutDot;
}

function hasFramePackageAssetExtension(relativePath: string): boolean {
  const extIdx = relativePath.lastIndexOf(".");
  if (extIdx <= 0 || relativePath.includes("/", extIdx)) {
    return false;
  }
  const ext = relativePath.slice(extIdx).toLowerCase();
  if (!ext || ext === "." || ext.includes(":") || ext.includes(" ")) {
    return false;
  }
  return FRAME_PACKAGE_ASSET_EXTENSIONS.has(ext);
}

/** Mirrors front `parseExtractableFramePackageRelativePath` — requires `./` + asset ext. */
function parseExtractableFramePackageRelativePath(
  value: string
): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("./")) {
    return null;
  }
  const relativePath = parseFramePackageRelativePath(trimmed);
  if (!relativePath || !hasFramePackageAssetExtension(relativePath)) {
    return null;
  }
  return relativePath;
}

function formatFramePackageRelativePath(relativePath: string): string {
  return `./${relativePath}`;
}

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
    if (isScopedPath(value)) {
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
