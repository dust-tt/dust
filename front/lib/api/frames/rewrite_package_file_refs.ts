import {
  isRewritableFrameSourcePath,
  tryRewriteScopedPathToPackageRelative,
} from "@app/lib/api/frames/package_file_ref_paths";
import ts from "typescript";

type StringLiteralRewrite = {
  start: number;
  end: number;
  nextValue: string;
};

/**
 * Rewrite string literals that point at in-package files from absolute scoped paths to
 * `./relative` form. Matches the allowlist extractor: any string literal / no-substitution
 * template that is an in-package scoped path is rewritten (not only direct `useFile("…")`
 * args), so patterns like `const PATH = "conversation-…/data.csv"; useFile(PATH)` become
 * portable. Relative imports (`./Chart`) are untouched — they are not scoped paths.
 *
 * Server-only: uses TypeScript. Do not import from client bundles.
 */
export function rewriteInPackageUseFilePaths(
  code: string,
  {
    frameRoot,
    packageFiles,
  }: {
    frameRoot: string;
    packageFiles: ReadonlySet<string>;
  }
): { code: string; changed: boolean } {
  const sourceFile = ts.createSourceFile(
    "frame.tsx",
    code,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TSX
  );

  const rewrites: StringLiteralRewrite[] = [];
  const seenSpans = new Set<string>();

  const maybeRewriteLiteral = (
    literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral
  ) => {
    const spanKey = `${literal.getStart(sourceFile)}:${literal.getEnd()}`;
    if (seenSpans.has(spanKey)) {
      return;
    }

    const next = tryRewriteScopedPathToPackageRelative({
      scopedPath: literal.text,
      frameRoot,
      packageFiles,
    });
    if (!next || next === literal.text) {
      return;
    }

    seenSpans.add(spanKey);
    rewrites.push({
      start: literal.getStart(sourceFile),
      end: literal.getEnd(),
      nextValue: ts.isNoSubstitutionTemplateLiteral(literal)
        ? `\`${next.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``
        : JSON.stringify(next),
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      maybeRewriteLiteral(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (rewrites.length === 0) {
    return { code, changed: false };
  }

  rewrites.sort((a, b) => b.start - a.start);
  let nextCode = code;
  for (const rewrite of rewrites) {
    nextCode =
      nextCode.slice(0, rewrite.start) +
      rewrite.nextValue +
      nextCode.slice(rewrite.end);
  }

  return { code: nextCode, changed: true };
}

/**
 * Apply in-package useFile rewrites across Frame source files. Returns updated buffers for
 * every path (unchanged files keep their original content). Preserves extra fields on each
 * source file (e.g. contentType).
 */
export function rewriteFrameSourcePackageFileRefs<
  T extends { relativePath: string; content: Buffer },
>({
  sourceFiles,
  frameRoot,
}: {
  sourceFiles: ReadonlyArray<T>;
  frameRoot: string;
}): {
  sourceFiles: T[];
  rewrittenPaths: string[];
} {
  const packageFiles = new Set(sourceFiles.map((f) => f.relativePath));
  const rewrittenPaths: string[] = [];

  const nextFiles = sourceFiles.map((sourceFile) => {
    if (!isRewritableFrameSourcePath(sourceFile.relativePath)) {
      return sourceFile;
    }

    const original = sourceFile.content.toString("utf8");
    const { code, changed } = rewriteInPackageUseFilePaths(original, {
      frameRoot,
      packageFiles,
    });
    if (!changed) {
      return sourceFile;
    }

    rewrittenPaths.push(sourceFile.relativePath);
    return {
      ...sourceFile,
      content: Buffer.from(code, "utf8"),
    };
  });

  return { sourceFiles: nextFiles, rewrittenPaths };
}
