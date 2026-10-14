import path from "node:path";

import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import ts from "typescript";

/** Max length for each of server and tool in a persisted `tools.call` pair. */
export const FRAME_TOOL_CALL_REF_MAX_LENGTH = 255;

export type FrameToolCallPair = [server: string, tool: string];

export type ExtractFrameToolCallsErrorCode =
  | "non_literal_tools_call"
  | "tool_call_ref_too_long"
  | "import_escape"
  | "import_missing";

export class ExtractFrameToolCallsError extends Error {
  constructor(
    readonly code: ExtractFrameToolCallsErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ExtractFrameToolCallsError";
  }
}

// Same probe order as `bundle_module` — first match wins when a specifier omits an extension.
const RESOLVE_EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", ".json"] as const;

function isRelativeSpecifier(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../");
}

function pairKey([server, tool]: FrameToolCallPair): string {
  return `${server}\0${tool}`;
}

export function sortAndDedupeToolCalls(
  pairs: Iterable<FrameToolCallPair>
): FrameToolCallPair[] {
  const byKey = new Map<string, FrameToolCallPair>();
  for (const pair of pairs) {
    byKey.set(pairKey(pair), pair);
  }
  return [...byKey.values()].sort((left, right) => {
    const byServer = left[0].localeCompare(right[0]);
    return byServer !== 0 ? byServer : left[1].localeCompare(right[1]);
  });
}

function resolveRelativeImport({
  importerRel,
  spec,
  index,
}: {
  importerRel: string;
  spec: string;
  index: ReadonlySet<string>;
}): Result<string, ExtractFrameToolCallsError> {
  const joined = path.posix.normalize(
    path.posix.join(path.posix.dirname(importerRel), spec)
  );
  if (joined.startsWith("..") || path.posix.isAbsolute(joined)) {
    return new Err(
      new ExtractFrameToolCallsError(
        "import_escape",
        `Relative import escapes the Frame package: ${spec} (from ${importerRel})`
      )
    );
  }

  const probe = (base: string, allowBare: boolean): string | null => {
    for (const ext of RESOLVE_EXTENSIONS) {
      if (!ext && !allowBare) {
        continue;
      }
      if (index.has(`${base}${ext}`)) {
        return `${base}${ext}`;
      }
    }
    return null;
  };

  const asFile = probe(joined, true);
  if (asFile) {
    return new Ok(asFile);
  }

  const asIndex = probe(`${joined}/index`, false);
  if (asIndex) {
    return new Ok(asIndex);
  }

  return new Err(
    new ExtractFrameToolCallsError(
      "import_missing",
      `Relative import not found in Frame source: ${spec} (from ${importerRel})`
    )
  );
}

function literalString(
  node: ts.Expression | undefined
):
  | { kind: "literal"; value: string }
  | { kind: "missing" }
  | { kind: "non_literal" } {
  if (!node) {
    return { kind: "missing" };
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: "literal", value: node.text };
  }
  if (ts.isTemplateExpression(node) && node.templateSpans.length === 0) {
    return { kind: "literal", value: node.head.text };
  }
  return { kind: "non_literal" };
}

type PodToolsBindings = {
  /** Local names from `import { tools as x }` — call sites are `x.call(...)`. */
  namedTools: ReadonlySet<string>;
  /** Local names from `import * as pod` — call sites are `pod.tools.call(...)`. */
  namespaces: ReadonlySet<string>;
};

/**
 * True when the call is `local.call(...)` / `ns.tools.call(...)` / `local["call"](...)`
 * for a binding imported from `@dust/pod`.
 */
function isToolsCallExpression(
  node: ts.CallExpression,
  bindings: PodToolsBindings
): "property" | "element" | false {
  const { expression } = node;

  // `tools.call(...)` or aliased named import.
  if (
    ts.isPropertyAccessExpression(expression) &&
    !expression.questionDotToken &&
    expression.name.text === "call" &&
    ts.isIdentifier(expression.expression) &&
    bindings.namedTools.has(expression.expression.text)
  ) {
    return "property";
  }

  // `pod.tools.call(...)` from `import * as pod from "@dust/pod"`.
  if (
    ts.isPropertyAccessExpression(expression) &&
    !expression.questionDotToken &&
    expression.name.text === "call" &&
    ts.isPropertyAccessExpression(expression.expression) &&
    !expression.expression.questionDotToken &&
    expression.expression.name.text === "tools" &&
    ts.isIdentifier(expression.expression.expression) &&
    bindings.namespaces.has(expression.expression.expression.text)
  ) {
    return "property";
  }

  // `tools["call"](...)` — refuse so the allowlist stays complete.
  if (
    ts.isElementAccessExpression(expression) &&
    !expression.questionDotToken &&
    ts.isIdentifier(expression.expression) &&
    bindings.namedTools.has(expression.expression.text)
  ) {
    const arg = expression.argumentExpression;
    if (
      arg &&
      (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) &&
      arg.text === "call"
    ) {
      return "element";
    }
  }

  return false;
}

function collectPodToolsBindings(sourceFile: ts.SourceFile): PodToolsBindings {
  const namedTools = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      continue;
    }
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@dust/pod"
    ) {
      continue;
    }
    const { importClause } = statement;
    if (!importClause.namedBindings) {
      continue;
    }
    if (ts.isNamespaceImport(importClause.namedBindings)) {
      namespaces.add(importClause.namedBindings.name.text);
      continue;
    }
    if (ts.isNamedImports(importClause.namedBindings)) {
      for (const element of importClause.namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (importedName === "tools") {
          namedTools.add(element.name.text);
        }
      }
    }
  }
  return { namedTools, namespaces };
}

function collectRelativeImportSpecs(sourceFile: ts.SourceFile): string[] {
  const specs: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isRelativeSpecifier(node.moduleSpecifier.text)
    ) {
      specs.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 1 &&
      ((ts.isIdentifier(node.expression) &&
        node.expression.text === "require") ||
        node.expression.kind === ts.SyntaxKind.ImportKeyword)
    ) {
      const arg = node.arguments[0];
      if (
        (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) &&
        isRelativeSpecifier(arg.text)
      ) {
        specs.push(arg.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specs;
}

function parseSourceFile(relativePath: string, content: string): ts.SourceFile {
  const scriptKind = relativePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : relativePath.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS;

  return ts.createSourceFile(
    relativePath,
    content,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    scriptKind
  );
}

function extractPairsFromSource({
  relativePath,
  content,
}: {
  relativePath: string;
  content: string;
}): Result<FrameToolCallPair[], ExtractFrameToolCallsError> {
  const sourceFile = parseSourceFile(relativePath, content);
  const toolsBindings = collectPodToolsBindings(sourceFile);
  if (
    toolsBindings.namedTools.size === 0 &&
    toolsBindings.namespaces.size === 0
  ) {
    return new Ok([]);
  }

  const pairs: FrameToolCallPair[] = [];

  const visit = (
    node: ts.Node
  ): Result<undefined, ExtractFrameToolCallsError> => {
    if (ts.isCallExpression(node)) {
      const kind = isToolsCallExpression(node, toolsBindings);
      if (kind === "element") {
        return new Err(
          new ExtractFrameToolCallsError(
            "non_literal_tools_call",
            `Dynamic tools.call access is not allowed in ${relativePath}; use tools.call(server, tool, args).`
          )
        );
      }
      if (kind === "property") {
        const serverArg = literalString(node.arguments[0]);
        const toolArg = literalString(node.arguments[1]);
        if (
          serverArg.kind === "non_literal" ||
          toolArg.kind === "non_literal" ||
          serverArg.kind === "missing" ||
          toolArg.kind === "missing"
        ) {
          return new Err(
            new ExtractFrameToolCallsError(
              "non_literal_tools_call",
              `tools.call(server, tool) in ${relativePath} must use string literal server and tool names.`
            )
          );
        }
        if (
          serverArg.value.length === 0 ||
          toolArg.value.length === 0 ||
          serverArg.value.length > FRAME_TOOL_CALL_REF_MAX_LENGTH ||
          toolArg.value.length > FRAME_TOOL_CALL_REF_MAX_LENGTH
        ) {
          return new Err(
            new ExtractFrameToolCallsError(
              "tool_call_ref_too_long",
              `tools.call server and tool in ${relativePath} must be non-empty and at most ` +
                `${FRAME_TOOL_CALL_REF_MAX_LENGTH} characters.`
            )
          );
        }
        pairs.push([serverArg.value, toolArg.value]);
      }
    }

    let childError: ExtractFrameToolCallsError | null = null;
    ts.forEachChild(node, (child) => {
      if (childError) {
        return;
      }
      const result = visit(child);
      if (result.isErr()) {
        childError = result.error;
      }
    });
    if (childError) {
      return new Err(childError);
    }
    return new Ok(undefined);
  };

  const walk = visit(sourceFile);
  if (walk.isErr()) {
    return walk;
  }
  return new Ok(pairs);
}

/**
 * Walk a Frame function entry point and its relative import closure, collecting
 * literal `tools.call(server, tool)` pairs from `@dust/pod` bindings.
 */
export function extractFrameFunctionToolCalls({
  entryPoint,
  sourceByPath,
}: {
  entryPoint: string;
  sourceByPath: ReadonlyMap<string, string>;
}): Result<FrameToolCallPair[], ExtractFrameToolCallsError> {
  if (!isSafeFrameRelativePath(entryPoint) || !sourceByPath.has(entryPoint)) {
    return new Err(
      new ExtractFrameToolCallsError(
        "import_missing",
        `Frame function entry point not found: ${entryPoint}`
      )
    );
  }

  const index = new Set(sourceByPath.keys());
  const queue = [entryPoint];
  const visited = new Set<string>();
  const allPairs: FrameToolCallPair[] = [];

  while (queue.length > 0) {
    const relativePath = queue.pop()!;
    if (visited.has(relativePath)) {
      continue;
    }
    visited.add(relativePath);

    const content = sourceByPath.get(relativePath);
    if (content === undefined) {
      return new Err(
        new ExtractFrameToolCallsError(
          "import_missing",
          `Frame source file not found: ${relativePath}`
        )
      );
    }

    const pairsResult = extractPairsFromSource({ relativePath, content });
    if (pairsResult.isErr()) {
      return pairsResult;
    }
    allPairs.push(...pairsResult.value);

    const sourceFile = parseSourceFile(relativePath, content);
    for (const spec of collectRelativeImportSpecs(sourceFile)) {
      const resolved = resolveRelativeImport({
        importerRel: relativePath,
        spec,
        index,
      });
      if (resolved.isErr()) {
        return resolved;
      }
      if (!visited.has(resolved.value)) {
        queue.push(resolved.value);
      }
    }
  }

  return new Ok(sortAndDedupeToolCalls(allPairs));
}
