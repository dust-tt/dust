import path from "node:path";

import {
  isRewritableFrameSourcePath,
  tryRewriteScopedPathToPackageRelative,
} from "@app/lib/api/frames/package_file_ref_paths";
import type { FramePublicationSourceFile } from "@app/lib/api/frames/publication_storage";
import { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import ts from "typescript";

const SCRIPT_KIND_BY_EXTENSION = new Map<string, ts.ScriptKind>([
  [".js", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
  [".ts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
]);

const MAX_REPORTED_VIOLATIONS = 5;

type FrameSourceInput = Pick<
  FramePublicationSourceFile,
  "content" | "relativePath"
>;

type PackageFileRefViolation = {
  sourcePath: string;
  line: number;
  column: number;
  found: string;
  expected: string;
};

/**
 * Collect absolute scoped paths in Frame UI/source that point at files inside this package.
 * Those must be written as `./…` by the author (publish no longer rewrites them).
 */
function collectInPackageAbsolutePathViolations(
  sourceFile: ts.SourceFile,
  {
    frameRoot,
    packageFiles,
  }: {
    frameRoot: string;
    packageFiles: ReadonlySet<string>;
  }
): PackageFileRefViolation[] {
  const violations: PackageFileRefViolation[] = [];
  const seenSpans = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const spanKey = `${node.getStart(sourceFile)}:${node.getEnd()}`;
      if (!seenSpans.has(spanKey)) {
        seenSpans.add(spanKey);
        const expected = tryRewriteScopedPathToPackageRelative({
          scopedPath: node.text,
          frameRoot,
          packageFiles,
        });
        if (expected && expected !== node.text) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile)
          );
          violations.push({
            sourcePath: sourceFile.fileName,
            line: line + 1,
            column: character + 1,
            found: node.text,
            expected,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

/**
 * Reject Frame source that references in-package files via absolute scoped paths.
 *
 * Files inside the Frame package must use portable `./…` paths (e.g. `useFile("./data.csv")`).
 * Absolute `conversation-…/MyFrame/data.csv` / `pod-…/MyFrame/data.csv` forms break when the
 * Frame is shared or moved. Agents are instructed to write `./…` themselves; this check is the
 * backstop on publish/validate.
 */
export function validateFramePackageFileRefs({
  frameRoot,
  sourceFiles,
}: {
  frameRoot: string;
  sourceFiles: readonly FrameSourceInput[];
}): Result<undefined, FramePublicationError> {
  const packageFiles = new Set(sourceFiles.map((f) => f.relativePath));
  const violations: PackageFileRefViolation[] = [];

  for (const { content, relativePath } of sourceFiles) {
    if (!isRewritableFrameSourcePath(relativePath)) {
      continue;
    }

    const scriptKind = SCRIPT_KIND_BY_EXTENSION.get(
      path.posix.extname(relativePath)
    );
    if (scriptKind === undefined) {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      relativePath,
      content.toString("utf8"),
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ false,
      scriptKind
    );
    violations.push(
      ...collectInPackageAbsolutePathViolations(sourceFile, {
        frameRoot,
        packageFiles,
      })
    );
  }

  if (violations.length === 0) {
    return new Ok(undefined);
  }

  const listed = violations.slice(0, MAX_REPORTED_VIOLATIONS);
  const remaining = violations.length - listed.length;

  return new Err(
    new FramePublicationError(
      "invalid_package_file_ref",
      [
        "Frame source references files inside this Frame package with absolute scoped paths.",
        "Use package-relative paths starting with `./` so the Frame stays portable when shared or moved.",
        ...listed.map(
          (v) =>
            `${v.sourcePath}:${v.line}:${v.column}: replace "${v.found}" with "${v.expected}"`
        ),
        ...(remaining > 0 ? [`${remaining} more not shown.`] : []),
      ].join("\n")
    )
  );
}
