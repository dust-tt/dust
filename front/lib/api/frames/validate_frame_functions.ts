import path from "node:path";
import type { FramePublicationSourceFile } from "@app/lib/api/frames/publication_storage";
import { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import ts from "typescript";

const DUST_REACT_HOOKS_MODULE = "@dust/react-hooks";

// The two hooks a Frame's UI calls its own functions through. `callFunction` is deliberately not
// here: it addressed Pod functions, which no longer exist.
const FRAME_FUNCTION_HOOKS = new Set([
  "usePodFunction",
  "usePodFunctionMutation",
]);

const SCRIPT_KIND_BY_EXTENSION = new Map<string, ts.ScriptKind>([
  [".js", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
  [".ts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
]);

const MAX_REPORTED_REFERENCES = 5;

type FrameSourceInput = Pick<
  FramePublicationSourceFile,
  "content" | "relativePath"
>;

type HookBindings = {
  // Local name -> hook, for named imports (following aliases).
  hookByLocalName: Map<string, string>;
  namespaceNames: Set<string>;
};

/** Local names the Frame's function hooks are reachable under in one source file. */
function collectHookBindings(sourceFile: ts.SourceFile): HookBindings {
  const hookByLocalName = new Map<string, string>();
  const namespaceNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== DUST_REACT_HOOKS_MODULE
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (!bindings) {
      continue;
    }
    if (ts.isNamespaceImport(bindings)) {
      namespaceNames.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (FRAME_FUNCTION_HOOKS.has(imported)) {
        hookByLocalName.set(element.name.text, imported);
      }
    }
  }

  return { hookByLocalName, namespaceNames };
}

function hookForCallee(
  callee: ts.Expression,
  { hookByLocalName, namespaceNames }: HookBindings
): string | undefined {
  if (ts.isIdentifier(callee)) {
    return hookByLocalName.get(callee.text);
  }
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    namespaceNames.has(callee.expression.text) &&
    FRAME_FUNCTION_HOOKS.has(callee.name.text)
  ) {
    return callee.name.text;
  }

  return undefined;
}

/** One `<file>:<line>:<column>: <hook>('<name>')` line per literal reference not in `declared`. */
function collectUndeclaredReferences(
  sourceFile: ts.SourceFile,
  declared: ReadonlySet<string>
): string[] {
  const bindings = collectHookBindings(sourceFile);
  const undeclared: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const hook = hookForCallee(node.expression, bindings);
      const reference = node.arguments[0];
      // A computed reference cannot be checked statically.
      if (
        hook &&
        reference &&
        ts.isStringLiteralLike(reference) &&
        !declared.has(reference.text)
      ) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          reference.getStart(sourceFile)
        );
        undeclared.push(
          `${sourceFile.fileName}:${line + 1}:${character + 1}: ${hook}('${reference.text}')`
        );
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return undeclared;
}

/**
 * Reject a Frame whose UI names a function its own manifest does not declare.
 *
 * This runs on the publish path because the check is exact: a v2 reference resolves to
 * `<frameId>/<name>`, so a literal that matches no declared name cannot resolve for any input or
 * any viewer, and publishing it ships a Frame with a button that always fails. Computed references
 * are skipped, so a UI that builds names at run time stays publishable.
 */
export function validateFrameFunctionReferences({
  declaredFunctionNames,
  sourceFiles,
}: {
  declaredFunctionNames: readonly string[];
  sourceFiles: readonly FrameSourceInput[];
}): Result<undefined, FramePublicationError> {
  const declared = new Set(declaredFunctionNames);
  const undeclared: string[] = [];

  for (const { content, relativePath } of sourceFiles) {
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
      false,
      scriptKind
    );
    undeclared.push(...collectUndeclaredReferences(sourceFile, declared));
  }

  if (undeclared.length === 0) {
    return new Ok(undefined);
  }

  const listed = undeclared.slice(0, MAX_REPORTED_REFERENCES);
  const remaining = undeclared.length - listed.length;
  const declaredSummary =
    declaredFunctionNames.length === 0
      ? "This Frame's manifest declares no functions."
      : `Declared functions: ${declaredFunctionNames.map((name) => `'${name}'`).join(", ")}.`;

  return new Err(
    new FramePublicationError(
      "invalid_function_reference",
      [
        "Frame UI calls a function that is not declared in its manifest:",
        ...listed,
        ...(remaining > 0 ? [`${remaining} more not shown.`] : []),
        declaredSummary,
      ].join("\n")
    )
  );
}
