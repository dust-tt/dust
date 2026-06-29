import logger from "@app/logger/logger";
import ts from "typescript";

// DOM attribute carrying a JSX element's source origin as `<file>:<line>:<col>` (1-based).
// It is injected before bundling so it survives esbuild inlining and reaches the rendered
// DOM, letting inline ("live") edits route a clicked element back to its source file and
// location. The viz selection runtime reads this attribute.
export const SOURCE_LOCATION_ATTRIBUTE = "data-source";

/**
 * Inject a `data-source="<file>:<line>:<col>"` attribute on every JSX element of `code`.
 *
 * Implemented as a string splice over positions from the TypeScript AST (the same technique
 * as `transformEditableText`) rather than reprinting the AST: this keeps the original source
 * bytes intact (no reformatting) and stays tolerant of partial code. On any parse failure it
 * returns the input unchanged so a tagging issue never breaks a build.
 *
 * `fileName` should be the path used to address the source later (the mount-relative path),
 * since that is what the live-edit write-back resolves.
 */
export function injectSourceLocationTags(
  fileName: string,
  code: string
): string {
  const inserts: { pos: number; text: string }[] = [];

  try {
    const sourceFile = ts.createSourceFile(
      fileName,
      code,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TSX
    );

    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          node.tagName.getStart(sourceFile)
        );

        const value = `${fileName}:${line + 1}:${character + 1}`;
        inserts.push({
          pos: node.tagName.getEnd(),
          text: ` ${SOURCE_LOCATION_ATTRIBUTE}="${value}"`,
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  } catch (err) {
    logger.error({ err, fileName }, "Failed to inject source-location tags");
    return code;
  }

  // Splice right-to-left so earlier byte offsets stay valid after each insertion.
  inserts.sort((a, b) => b.pos - a.pos);

  let out = code;
  for (const ins of inserts) {
    out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
  }

  return out;
}
