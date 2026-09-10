import path from "node:path";
import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import type { FramePublicationSourceFile } from "@app/lib/api/frames/publication_storage";
import logger from "@app/logger/logger";
import type { FramePublicationDescriptor } from "@app/types/api/frame_publication";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { JSONSchema4 } from "json-schema";
import { compile } from "json-schema-to-typescript";
import ts from "typescript";

const DUST_REACT_HOOKS_MODULE = "@dust/react-hooks";
const VIRTUAL_FRAME_ROOT = "/__dust_frame__";
const VIRTUAL_DUST_REACT_HOOKS_PATH = `${VIRTUAL_FRAME_ROOT}/node_modules/@dust/react-hooks/index.d.ts`;
const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"] as const;
const RESOLVE_EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js"] as const;

// The two hooks a Frame's UI calls its own functions through. `callFunction` is deliberately not
// here: it addressed Pod functions, which no longer exist.
const QUERY_HOOK = "usePodFunction";
const MUTATION_HOOK = "usePodFunctionMutation";
const FRAME_FUNCTION_HOOKS = [QUERY_HOOK, MUTATION_HOOK] as const;

// Every other `@dust/react-hooks` export, declared permissively so importing one is not an error
// in the virtual program.
const PERMISSIVE_MODULE_EXPORTS = [
  "SandboxFunctionCallError",
  "callFunction",
  "captureScreenshot",
  "triggerUserFileDownload",
  "useFile",
  "useUserIdentity",
] as const;

const MAX_REPORTED_WARNINGS = 5;
const MAX_LISTED_FUNCTION_NAMES = 12;

const INPUT_DIAGNOSTIC_CODES = new Set([
  2322, // Type is not assignable to the expected input type.
  2345, // Argument is not assignable to the input parameter.
  2353, // Object literal contains an unknown property.
  2561, // Object literal contains a near-miss misspelling of a known property.
  2739, // Input is missing several required properties.
  2741, // Input is missing a required property.
]);
const CALL_DIAGNOSTIC_CODES = new Set([
  2554, // Call has the wrong number of arguments.
  2769, // No overload accepts the provided arguments.
]);

type FrameFunctionContract = Pick<
  FramePublicationDescriptor["functions"][number],
  "name" | "inputSchema"
>;

function isSourceFile(relativePath: string): boolean {
  return SOURCE_EXTENSIONS.some((extension) =>
    relativePath.endsWith(extension)
  );
}

function extensionForPath(filePath: string): ts.Extension {
  if (filePath.endsWith(".tsx")) {
    return ts.Extension.Tsx;
  }
  if (filePath.endsWith(".ts")) {
    return ts.Extension.Ts;
  }
  if (filePath.endsWith(".jsx")) {
    return ts.Extension.Jsx;
  }

  return ts.Extension.Js;
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith(".ts") || filePath.endsWith(".d.ts")) {
    return ts.ScriptKind.TS;
  }
  if (filePath.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }

  return ts.ScriptKind.JS;
}

function parseSource(relativePath: string, code: string): ts.SourceFile {
  return ts.createSourceFile(
    relativePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(relativePath)
  );
}

function formatPosition(sourceFile: ts.SourceFile, position: number): string {
  const { line, character } =
    sourceFile.getLineAndCharacterOfPosition(position);

  return `${sourceFile.fileName}:${line + 1}:${character + 1}`;
}

/**
 * Local names the Frame's function hooks are reachable under in one source file: their named
 * imports (following aliases) and any namespace import of the module.
 */
function collectHookBindings(sourceFile: ts.SourceFile): {
  hookByLocalName: Map<string, string>;
  namespaceNames: Set<string>;
} {
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
      if (FRAME_FUNCTION_HOOKS.some((hook) => hook === imported)) {
        hookByLocalName.set(element.name.text, imported);
      }
    }
  }

  return { hookByLocalName, namespaceNames };
}

type HookCall = {
  hook: string;
  reference: ts.StringLiteralLike | null;
  sourceFile: ts.SourceFile;
};

function collectHookCalls(sourceFile: ts.SourceFile): HookCall[] {
  const { hookByLocalName, namespaceNames } = collectHookBindings(sourceFile);
  if (hookByLocalName.size === 0 && namespaceNames.size === 0) {
    return [];
  }

  const calls: HookCall[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      let hook: string | undefined;
      if (ts.isIdentifier(callee)) {
        hook = hookByLocalName.get(callee.text);
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        namespaceNames.has(callee.expression.text) &&
        FRAME_FUNCTION_HOOKS.some((candidate) => candidate === callee.name.text)
      ) {
        hook = callee.name.text;
      }

      if (hook) {
        const argument = node.arguments[0];
        calls.push({
          hook,
          reference:
            argument && ts.isStringLiteralLike(argument) ? argument : null,
          sourceFile,
        });
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return calls;
}

function describeDeclaredFunctions(declaredNames: readonly string[]): string {
  if (declaredNames.length === 0) {
    return "This Frame's manifest declares no functions.";
  }

  const listed = declaredNames.slice(0, MAX_LISTED_FUNCTION_NAMES);
  const suffix =
    declaredNames.length > listed.length
      ? `, and ${declaredNames.length - listed.length} more`
      : "";

  return `Declared functions: ${listed.map((name) => `'${name}'`).join(", ")}${suffix}.`;
}

/**
 * A Frames v2 UI addresses its own functions by bare manifest name; `resolveFrameFunctionReference`
 * rejects everything else. A reference that names nothing in the manifest fails only when a viewer
 * triggers the call, so report it here.
 */
function collectReferenceWarnings(
  hookCalls: readonly HookCall[],
  declaredNames: readonly string[]
): ValidationWarning[] {
  const declared = new Set(declaredNames);
  const warnings: ValidationWarning[] = [];

  for (const { hook, reference, sourceFile } of hookCalls) {
    // A computed reference cannot be checked statically.
    if (!reference || declared.has(reference.text)) {
      continue;
    }

    const position = formatPosition(sourceFile, reference.getStart());
    const [, ...rest] = reference.text.split("/");
    const trailingSegment = rest.length > 0 ? rest.join("/") : null;
    if (trailingSegment !== null) {
      warnings.push({
        type: "frame_function",
        message:
          `${position}: ${hook}('${reference.text}') uses a '<podId>/<slug>' Pod function ` +
          "reference. A Frames v2 UI calls its own functions by bare manifest name.",
        oldString: reference.text,
        suggestion: declared.has(trailingSegment)
          ? `Use '${trailingSegment}'.`
          : describeDeclaredFunctions(declaredNames),
      });
      continue;
    }

    warnings.push({
      type: "frame_function",
      message:
        `${position}: ${hook}('${reference.text}') names a function this Frame's manifest does ` +
        "not declare. The call fails at run time, when a viewer triggers it.",
      oldString: reference.text,
      suggestion: describeDeclaredFunctions(declaredNames),
    });
  }

  return warnings;
}

/**
 * Declare the module so a declared function's name selects its input type.
 *
 * The input is typed through a conditional on the inferred name rather than by constraining the
 * name to `keyof`, which matters in both directions: a name outside the map resolves the input to
 * `any`, so an unknown or computed reference falls through untyped instead of cascading onto the
 * input that the reference warning already covers — and, unlike an overload pair, there is no
 * permissive signature for a mistyped input to fall back to, which would silently pass everything.
 */
async function buildDustReactHooksDeclaration(
  contracts: readonly FrameFunctionContract[]
): Promise<string> {
  const declarations: string[] = [];
  const entries: string[] = [];

  for (const [index, contract] of contracts.entries()) {
    const namespace = `FrameFunctionContract${index}`;
    // The converter supports draft 7 but exposes a draft 4 input type.
    const schema = contract.inputSchema as JSONSchema4;
    const typeDeclaration = await compile(schema, "Input", {
      // Function schemas only need internal references.
      $refOptions: { resolve: { external: false, file: false, http: false } },
      bannerComment: "",
      enableConstEnums: false,
      format: false,
      ignoreMinAndMaxItems: true,
      unknownAny: true,
    });

    declarations.push(`export namespace ${namespace} {\n${typeDeclaration}\n}`);
    entries.push(`  ${JSON.stringify(contract.name)}: ${namespace}.Input;`);
  }

  // Results stay permissive: this pass checks what the Frame sends, not what it does with what
  // comes back. Typing `data` would move diagnostics out of the call arguments, where nothing
  // separates them from the Frame's own unchecked type errors.
  return `${declarations.join("\n")}
export interface FrameFunctionInputs {
${entries.join("\n")}
}

export interface UsePodFunctionResult {
  data: any;
  error: Error | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: (...args: any[]) => any;
}

export interface UsePodFunctionMutationResult<TInput> {
  data: any;
  error: Error | undefined;
  isMutating: boolean;
  reset: () => void;
  trigger: (input: TInput) => Promise<any>;
}

export declare function ${QUERY_HOOK}<TFunction extends string | null>(
  functionName: TFunction,
  input: TFunction extends keyof FrameFunctionInputs
    ? FrameFunctionInputs[TFunction]
    : any
): UsePodFunctionResult;

export declare function ${MUTATION_HOOK}<TFunction extends string | null>(
  functionName: TFunction
): UsePodFunctionMutationResult<
  TFunction extends keyof FrameFunctionInputs
    ? FrameFunctionInputs[TFunction]
    : any
>;

${PERMISSIVE_MODULE_EXPORTS.map((name) => `export declare const ${name}: any;`).join("\n")}
`;
}

function resolveRelativeModule(
  moduleName: string,
  containingFile: string,
  virtualSources: ReadonlyMap<string, string>
): ts.ResolvedModuleFull | undefined {
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(containingFile), moduleName)
  );
  const candidates = RESOLVE_EXTENSIONS.flatMap((extension) => [
    `${base}${extension}`,
    extension ? `${base}/index${extension}` : null,
  ]).filter((candidate): candidate is string => candidate !== null);
  const resolvedFileName = candidates.find((candidate) =>
    virtualSources.has(candidate)
  );
  if (!resolvedFileName) {
    return undefined;
  }

  return {
    resolvedFileName,
    extension: extensionForPath(resolvedFileName),
    isExternalLibraryImport: false,
  };
}

function createVirtualProgram(
  virtualSources: ReadonlyMap<string, string>
): ts.Program {
  const compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    checkJs: true,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2020,
    types: [],
  };
  const defaultHost = ts.createCompilerHost(compilerOptions);
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: (fileName) =>
      virtualSources.has(fileName) || defaultHost.fileExists(fileName),
    getCurrentDirectory: () => VIRTUAL_FRAME_ROOT,
    getSourceFile: (fileName, languageVersion) => {
      const source = virtualSources.get(fileName);
      return source === undefined
        ? defaultHost.getSourceFile(fileName, languageVersion)
        : ts.createSourceFile(
            fileName,
            source,
            languageVersion,
            true,
            scriptKindForPath(fileName)
          );
    },
    readFile: (fileName) =>
      virtualSources.get(fileName) ?? defaultHost.readFile(fileName),
    resolveModuleNames: (moduleNames, containingFile) =>
      moduleNames.map((moduleName) => {
        if (moduleName === DUST_REACT_HOOKS_MODULE) {
          return {
            resolvedFileName: VIRTUAL_DUST_REACT_HOOKS_PATH,
            extension: ts.Extension.Dts,
            isExternalLibraryImport: true,
          };
        }

        return moduleName.startsWith(".")
          ? resolveRelativeModule(moduleName, containingFile, virtualSources)
          : undefined;
      }),
    writeFile: () => undefined,
  };

  return ts.createProgram({
    rootNames: Array.from(virtualSources.keys()).filter(
      (fileName) => fileName !== VIRTUAL_DUST_REACT_HOOKS_PATH
    ),
    options: compilerOptions,
    host,
  });
}

/** The argument carrying a function's input, or undefined for a call that passes none. */
function getInputArgumentRange(
  call: ts.CallExpression,
  checker: ts.TypeChecker
): { end: number; start: number } | undefined {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  // A named declaration is one of the hooks; the unnamed function type is the mutation's
  // `trigger`, whose only argument is the input.
  const hook =
    declaration && ts.isFunctionDeclaration(declaration) && declaration.name
      ? declaration.name.text
      : null;
  if (hook === MUTATION_HOOK) {
    return undefined;
  }

  const argument = hook === QUERY_HOOK ? call.arguments[1] : call.arguments[0];

  return argument
    ? { end: argument.getEnd(), start: argument.getStart() }
    : undefined;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file || diagnostic.start === undefined) {
    return `error TS${diagnostic.code}: ${message}`;
  }

  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start
  );
  const relativePath = path.posix.relative(
    VIRTUAL_FRAME_ROOT,
    diagnostic.file.fileName
  );

  return `${relativePath}:${line + 1}:${character + 1}: error TS${diagnostic.code}: ${message}`;
}

/**
 * Type-check what the Frame passes to its own functions against the input schemas extracted from
 * their published contracts.
 *
 * Contracts are authored in Zod but checked here through their extracted JSON Schema. Runtime-only
 * refinements are not always expressible as TypeScript types, so an input can pass here and still
 * fail the authoritative Zod validation when the function runs — which is why these are warnings.
 */
async function collectInputWarnings({
  contracts,
  sources,
}: {
  contracts: readonly FrameFunctionContract[];
  sources: ReadonlyMap<string, string>;
}): Promise<ValidationWarning[]> {
  const virtualSources = new Map<string, string>();
  for (const [relativePath, code] of sources) {
    virtualSources.set(path.posix.join(VIRTUAL_FRAME_ROOT, relativePath), code);
  }
  virtualSources.set(
    VIRTUAL_DUST_REACT_HOOKS_PATH,
    await buildDustReactHooksDeclaration(contracts)
  );

  const program = createVirtualProgram(virtualSources);
  const checker = program.getTypeChecker();
  const inputRangesBySource = new Map<
    ts.SourceFile,
    { end: number; start: number }[]
  >();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.fileName === VIRTUAL_DUST_REACT_HOOKS_PATH) {
      continue;
    }

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const signatures = checker
          .getTypeAtLocation(node.expression)
          .getCallSignatures();
        // Reaches the hooks and the `trigger` they return, whatever the Frame named them.
        const isFrameFunctionCall = signatures.some(
          (signature) =>
            signature.declaration?.getSourceFile().fileName ===
            VIRTUAL_DUST_REACT_HOOKS_PATH
        );
        if (isFrameFunctionCall) {
          const range = getInputArgumentRange(node, checker);
          if (range) {
            const ranges = inputRangesBySource.get(sourceFile) ?? [];
            ranges.push(range);
            inputRangesBySource.set(sourceFile, ranges);
          }
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const warnings: ValidationWarning[] = [];
  for (const diagnostic of program.getSemanticDiagnostics()) {
    const { file, start } = diagnostic;
    if (!file || start === undefined) {
      continue;
    }
    const ranges = inputRangesBySource.get(file);
    const withinInput = ranges?.some(
      (range) => start >= range.start && start < range.end
    );
    if (!withinInput) {
      continue;
    }
    if (
      !INPUT_DIAGNOSTIC_CODES.has(diagnostic.code) &&
      !CALL_DIAGNOSTIC_CODES.has(diagnostic.code)
    ) {
      continue;
    }

    warnings.push({
      type: "frame_function",
      message: `${formatDiagnostic(diagnostic)}`,
      suggestion:
        "Match the function's declared input, or update the function's `schema.input`.",
    });
  }

  return warnings;
}

/**
 * Statically check how a Frame's UI calls the Frame's own functions: that every literal reference
 * names a declared function, and that the input it passes matches that function's contract. Both
 * only surface at run time otherwise, when a viewer triggers the call.
 *
 * Warnings, never errors: the UI source is not type-checked anywhere else (esbuild strips types
 * without checking them), so this pass reports on code that has never had to satisfy a compiler.
 */
/**
 * @cc [owner:davidebbo,label:product;error-handling] frame-function-check-stays-advisory
 * This pass MUST only ever produce warnings, and MUST NOT throw. It type-checks UI source that no
 * other step compiles, against JSON Schema derived from Zod contracts whose runtime-only
 * refinements TypeScript cannot express — so it is heuristic in both directions, and every finding
 * is a lead rather than a verdict. Turning one into a `FramePublicationError`, or letting an
 * exception escape, would block publishing a Frame that works.
 */
export async function collectFrameFunctionWarnings({
  functions,
  sourceFiles,
}: {
  functions: readonly FrameFunctionContract[];
  sourceFiles: readonly Pick<
    FramePublicationSourceFile,
    "content" | "relativePath"
  >[];
}): Promise<ValidationWarning[]> {
  const sources = new Map<string, string>();
  for (const sourceFile of sourceFiles) {
    if (isSourceFile(sourceFile.relativePath)) {
      sources.set(sourceFile.relativePath, sourceFile.content.toString("utf8"));
    }
  }

  const hookCalls = Array.from(sources).flatMap(([relativePath, code]) =>
    collectHookCalls(parseSource(relativePath, code))
  );
  if (hookCalls.length === 0) {
    return [];
  }

  const declaredNames = functions.map((fn) => fn.name);
  const warnings = collectReferenceWarnings(hookCalls, declaredNames);

  // Nothing to check inputs against, and a `keyof` over an empty map would reject every call.
  if (functions.length > 0) {
    try {
      warnings.push(
        ...(await collectInputWarnings({ contracts: functions, sources }))
      );
    } catch (error) {
      // This pass is advisory. A schema the converter cannot express, or a compiler failure, must
      // not stand between an author and a publish.
      logger.warn(
        { error: normalizeError(error).message },
        "Frame function input validation failed; skipping input warnings."
      );
    }
  }

  if (warnings.length <= MAX_REPORTED_WARNINGS) {
    return warnings;
  }

  return [
    ...warnings.slice(0, MAX_REPORTED_WARNINGS),
    {
      type: "frame_function",
      message: `${warnings.length - MAX_REPORTED_WARNINGS} more Frame function warning(s) not shown.`,
    },
  ];
}
