import path from "node:path";
import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { JSONSchema7 as JSONSchema, JSONSchema4 } from "json-schema";
import { compile } from "json-schema-to-typescript";
import ts from "typescript";

const DUST_REACT_HOOKS_MODULE = "@dust/react-hooks";
const VIRTUAL_FRAME_ROOT = "/__dust_frame__";
const VIRTUAL_DUST_REACT_HOOKS_PATH = `${VIRTUAL_FRAME_ROOT}/node_modules/@dust/react-hooks/index.d.ts`;
const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"] as const;
const RESOLVE_EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js"] as const;
const INPUT_DIAGNOSTIC_CODES = new Set([
  2322, // Type is not assignable to the expected input type.
  2345, // Argument is not assignable to the input parameter.
  2353, // Object literal contains an unknown property.
  2741, // Input is missing a required property.
]);
const CALL_DIAGNOSTIC_CODES = new Set([
  2554, // Call has the wrong number of arguments.
  2769, // No overload accepts the provided arguments.
]);

// Names exported by the virtual @dust/react-hooks declaration that take a Pod function reference
// as their first argument. `callFunction` failures block publishing; hook failures are surfaced
// as warnings for now (see validateFramePodFunctionReferences) and will start blocking in an
// upcoming release.
const CALL_FUNCTION_NAME = "callFunction";
const POD_FUNCTION_CALLER_NAMES = new Set([
  CALL_FUNCTION_NAME,
  "usePodFunction",
  "usePodFunctionMutation",
]);

type PodFunctionCallOrigin = "call_function" | "hook";

// Appended to every hook-side warning while the rollout lasts.
const HOOK_BLOCKING_NOTICE =
  "this check will start blocking publishing in an upcoming release";
// Cap on the diagnostics reported per publish, for errors and warnings alike.
const MAX_REPORTED_DIAGNOSTICS = 5;

interface PodFunctionCall {
  call: ts.CallExpression;
  origin: PodFunctionCallOrigin;
}

type FramePodFunctionValidationErrorCode =
  | "invalid_pod_function_input"
  | "pod_function_not_found"
  | "pod_function_schema_invalid"
  | "pod_scope_not_found";

class FramePodFunctionValidationError extends Error {
  constructor(
    readonly code: FramePodFunctionValidationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "FramePodFunctionValidationError";
  }
}

function isSourceFile(relPath: string): boolean {
  return SOURCE_EXTENSIONS.some((extension) => relPath.endsWith(extension));
}

// Collects which of the Pod-function-calling exports (`callFunction` and the hooks) a source
// references, through named imports or namespace access on a `* as` import.
function collectPodFunctionCallerNames(
  relPath: string,
  code: string
): Set<string> {
  const sourceFile = ts.createSourceFile(
    relPath,
    code,
    ts.ScriptTarget.Latest,
    false,
    relPath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const referencedNames = new Set<string>();
  const namespaceImports = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== DUST_REACT_HOOKS_MODULE
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (POD_FUNCTION_CALLER_NAMES.has(importedName)) {
          referencedNames.add(importedName);
        }
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      namespaceImports.add(bindings.name.text);
    }
  }

  if (namespaceImports.size === 0) {
    return referencedNames;
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      namespaceImports.has(node.expression.text) &&
      POD_FUNCTION_CALLER_NAMES.has(node.name.text)
    ) {
      referencedNames.add(node.name.text);
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return referencedNames;
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

interface PodFunctionContract {
  functionReferences: string[];
  inputSchema: JSONSchema;
}

async function buildDustReactHooksDeclaration(
  functionContracts: readonly PodFunctionContract[]
): Promise<Result<string, FramePodFunctionValidationError>> {
  const declarations: string[] = [];
  const entries: string[] = [];

  for (const [index, contract] of functionContracts.entries()) {
    const namespace = `PodFunctionContract${index}`;
    const typeName = "Input";
    // The converter supports draft 7 but exposes a draft 4 input type.
    const schema = contract.inputSchema as JSONSchema4;
    try {
      const typeDeclaration = await compile(schema, typeName, {
        // Function schemas only need internal references.
        $refOptions: {
          resolve: {
            external: false,
            file: false,
            http: false,
          },
        },
        bannerComment: "",
        enableConstEnums: false,
        format: false,
        ignoreMinAndMaxItems: true,
        unknownAny: true,
      });

      declarations.push(
        `export namespace ${namespace} {\n${typeDeclaration}\n}`
      );
    } catch (error) {
      return new Err(
        new FramePodFunctionValidationError(
          "pod_function_schema_invalid",
          `Failed to convert a Pod function input schema to TypeScript: ${normalizeError(error).message}`
        )
      );
    }

    entries.push(
      ...contract.functionReferences.map(
        (functionReference) =>
          `  ${JSON.stringify(functionReference)}: ${namespace}.${typeName};`
      )
    );
  }

  // Return values stay permissive because this pass only validates calls. The hooks accept a
  // null reference (the runtime's "disabled" pattern); with a literal null first argument
  // TypeScript cannot infer TFunction and checks the input against the union of every function's
  // input type, so a disabled call whose input matches no published function reports an input
  // mismatch. The realistic disabled pattern (a conditional reference with the real input)
  // infers and checks cleanly.
  return new Ok(`${declarations.join("\n")}
export interface PodFunctionMap {
${entries.join("\n")}
}

export declare function callFunction<TFunction extends keyof PodFunctionMap>(
  functionId: TFunction,
  input: PodFunctionMap[TFunction]
): any;

export declare function usePodFunction<TFunction extends keyof PodFunctionMap>(
  slug: TFunction | null,
  input: PodFunctionMap[TFunction]
): any;

export declare function usePodFunctionMutation<TFunction extends keyof PodFunctionMap>(
  slug: TFunction | null
): any;
`);
}

type ClassifiedDiagnostic = {
  diagnostic: ts.Diagnostic;
  origin: PodFunctionCallOrigin;
  type: "input" | "reference";
};

// The first-argument handling applies to every caller shape alike: the Pod function reference is
// argument 0 for `callFunction(functionId, input)`, `usePodFunction(slug, input)` and
// `usePodFunctionMutation(slug)`, and the input — when the caller takes one — is argument 1.
function classifyDiagnostic(
  diagnostic: ts.Diagnostic,
  { call, origin }: PodFunctionCall
): ClassifiedDiagnostic | undefined {
  if (diagnostic.start === undefined) {
    return undefined;
  }

  const functionArgument = call.arguments[0];
  if (
    diagnostic.code === 2345 &&
    functionArgument !== undefined &&
    diagnostic.start >= functionArgument.getStart() &&
    diagnostic.start < functionArgument.getEnd()
  ) {
    return { diagnostic, origin, type: "reference" };
  }

  const inputArgument = call.arguments[1];
  if (
    inputArgument !== undefined &&
    INPUT_DIAGNOSTIC_CODES.has(diagnostic.code) &&
    diagnostic.start >= inputArgument.getStart() &&
    diagnostic.start < inputArgument.getEnd()
  ) {
    return { diagnostic, origin, type: "input" };
  }

  if (CALL_DIAGNOSTIC_CODES.has(diagnostic.code)) {
    return {
      diagnostic,
      origin,
      type: functionArgument ? "input" : "reference",
    };
  }

  return undefined;
}

function classifyDiagnostics(
  calls: readonly PodFunctionCall[],
  diagnostics: readonly ts.Diagnostic[]
): ClassifiedDiagnostic[] {
  const sortedCalls = [...calls].sort(
    (left, right) =>
      left.call.getStart() - right.call.getStart() ||
      right.call.getEnd() - left.call.getEnd()
  );
  const sortedDiagnostics = diagnostics
    .filter(
      (diagnostic): diagnostic is ts.Diagnostic & { start: number } =>
        diagnostic.start !== undefined
    )
    .sort((left, right) => left.start - right.start);
  const activeCalls: PodFunctionCall[] = [];
  const classified: ClassifiedDiagnostic[] = [];
  let callIndex = 0;

  // Call ranges are nested or disjoint, so one sweep finds the innermost call.
  for (const diagnostic of sortedDiagnostics) {
    while (
      callIndex < sortedCalls.length &&
      sortedCalls[callIndex].call.getStart() <= diagnostic.start
    ) {
      const call = sortedCalls[callIndex];
      while (
        activeCalls.length > 0 &&
        activeCalls[activeCalls.length - 1].call.getEnd() <=
          call.call.getStart()
      ) {
        activeCalls.pop();
      }
      activeCalls.push(call);
      callIndex++;
    }

    while (
      activeCalls.length > 0 &&
      activeCalls[activeCalls.length - 1].call.getEnd() <= diagnostic.start
    ) {
      activeCalls.pop();
    }

    const call = activeCalls[activeCalls.length - 1];
    if (call) {
      const result = classifyDiagnostic(diagnostic, call);
      if (result) {
        classified.push(result);
      }
    }
  }

  return classified;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file || diagnostic.start === undefined) {
    return `error TS${diagnostic.code}: ${message}`;
  }

  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start
  );
  const relPath = path.posix.relative(
    VIRTUAL_FRAME_ROOT,
    diagnostic.file.fileName
  );

  return `${relPath}:${line + 1}:${character + 1}: error TS${diagnostic.code}: ${message}`;
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

// Resolves the declared name behind a call whose signature comes from the virtual
// @dust/react-hooks declaration, so diagnostics can be attributed to `callFunction` (blocking)
// or to the hooks (warnings for now).
function podFunctionCallOrigin(
  signatures: readonly ts.Signature[]
): PodFunctionCallOrigin | undefined {
  for (const signature of signatures) {
    const declaration = signature.declaration;
    if (
      !declaration ||
      declaration.getSourceFile().fileName !== VIRTUAL_DUST_REACT_HOOKS_PATH ||
      !ts.isFunctionDeclaration(declaration)
    ) {
      continue;
    }

    const declaredName = declaration.name?.text;
    if (
      declaredName !== undefined &&
      POD_FUNCTION_CALLER_NAMES.has(declaredName)
    ) {
      return declaredName === CALL_FUNCTION_NAME ? "call_function" : "hook";
    }
  }

  return undefined;
}

function hookDiagnosticWarning({
  diagnostic,
  type,
}: ClassifiedDiagnostic): ValidationWarning {
  const headline =
    type === "reference"
      ? "Frame references a Pod function that is not available in its Pod"
      : "Frame passes input that does not match the Pod function contract";

  return {
    type: "pod_function",
    message: `${headline} (${HOOK_BLOCKING_NOTICE}): ${formatDiagnostic(diagnostic)}`,
  };
}

async function validateCallFunctionTypes({
  functionContracts,
  sources,
}: {
  functionContracts: readonly PodFunctionContract[];
  sources: ReadonlyMap<string, string>;
}): Promise<
  Result<{ warnings: ValidationWarning[] }, FramePodFunctionValidationError>
> {
  const virtualSources = new Map<string, string>();
  for (const [relPath, code] of sources) {
    if (isSourceFile(relPath)) {
      virtualSources.set(path.posix.join(VIRTUAL_FRAME_ROOT, relPath), code);
    }
  }
  const declaration = await buildDustReactHooksDeclaration(functionContracts);
  if (declaration.isErr()) {
    return declaration;
  }
  virtualSources.set(VIRTUAL_DUST_REACT_HOOKS_PATH, declaration.value);

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
  const rootNames = Array.from(virtualSources.keys()).filter(
    (fileName) => fileName !== VIRTUAL_DUST_REACT_HOOKS_PATH
  );
  const program = ts.createProgram({
    rootNames,
    options: compilerOptions,
    host,
  });
  const checker = program.getTypeChecker();
  const podFunctionCallsBySource = new Map<ts.SourceFile, PodFunctionCall[]>();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.fileName === VIRTUAL_DUST_REACT_HOOKS_PATH) {
      continue;
    }

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const signatures = checker
          .getTypeAtLocation(node.expression)
          .getCallSignatures();
        const origin = podFunctionCallOrigin(signatures);
        if (origin !== undefined) {
          const calls = podFunctionCallsBySource.get(sourceFile) ?? [];
          calls.push({ call: node, origin });
          podFunctionCallsBySource.set(sourceFile, calls);
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const diagnosticsBySource = new Map<ts.SourceFile, ts.Diagnostic[]>();
  for (const diagnostic of program.getSemanticDiagnostics()) {
    if (!diagnostic.file || !podFunctionCallsBySource.has(diagnostic.file)) {
      continue;
    }

    const diagnostics = diagnosticsBySource.get(diagnostic.file) ?? [];
    diagnostics.push(diagnostic);
    diagnosticsBySource.set(diagnostic.file, diagnostics);
  }

  const classified = Array.from(podFunctionCallsBySource).flatMap(
    ([sourceFile, calls]) =>
      classifyDiagnostics(calls, diagnosticsBySource.get(sourceFile) ?? [])
  );

  // Rollout: hook-based calls were unchecked until now, so their failures surface as warnings
  // for one release instead of blocking a republish of an existing frame. Flipping hooks to
  // blocking means folding the "hook" origin into this blocking set (and dropping the hook-only
  // downgrade in validateFramePodFunctionReferences).
  const blockingDiagnostics = classified.filter(
    ({ origin }) => origin === "call_function"
  );
  const hookDiagnostics = classified.filter(({ origin }) => origin === "hook");

  if (blockingDiagnostics.length > 0) {
    const hasInvalidReference = blockingDiagnostics.some(
      ({ type }) => type === "reference"
    );
    return new Err(
      new FramePodFunctionValidationError(
        hasInvalidReference
          ? "pod_function_not_found"
          : "invalid_pod_function_input",
        `${
          hasInvalidReference
            ? "Frame references a Pod function that is not available in its Pod"
            : "Frame passes input that does not match the Pod function contract"
        }:\n${blockingDiagnostics
          .slice(0, MAX_REPORTED_DIAGNOSTICS)
          .map(({ diagnostic }) => formatDiagnostic(diagnostic))
          .join("\n")}`
      )
    );
  }

  return new Ok({
    warnings: hookDiagnostics
      .slice(0, MAX_REPORTED_DIAGNOSTICS)
      .map(hookDiagnosticWarning),
  });
}

/**
 * Statically checks Pod function references and the structure of their inputs, for `callFunction`
 * and the `usePodFunction`/`usePodFunctionMutation` hooks.
 * Pod contracts are authored in Zod, but this check uses their extracted JSON Schema. Runtime-only
 * refinements and value constraints are not always expressible as TypeScript types, so an input can
 * pass here and still fail the authoritative Zod validation when the function runs.
 *
 * Rollout: `callFunction` failures block publishing as before. Hook failures — including
 * frame-level failures (missing Pod scope, schema conversion) of frames that only reach Pod
 * functions through the hooks — are returned as warnings for one release, because hook-based
 * frames were previously unchecked and a dangling reference must not hard-fail their next
 * publish. The blocking flip is a tracked follow-up.
 */
export async function validateFramePodFunctionReferences(
  auth: Authenticator,
  {
    file,
    sources,
  }: {
    file: FileResource;
    sources: ReadonlyMap<string, string>;
  }
): Promise<
  Result<{ warnings: ValidationWarning[] }, FramePodFunctionValidationError>
> {
  const referencedCallerNames = new Set<string>();
  for (const [relPath, code] of sources) {
    if (!isSourceFile(relPath)) {
      continue;
    }

    for (const name of collectPodFunctionCallerNames(relPath, code)) {
      referencedCallerNames.add(name);
    }
  }
  if (referencedCallerNames.size === 0) {
    return new Ok({ warnings: [] });
  }

  // Hook-only frames get the warning treatment on failures that would otherwise block.
  const blockOnFailure = referencedCallerNames.has(CALL_FUNCTION_NAME);
  const frameFailure = (
    error: FramePodFunctionValidationError
  ): Result<
    { warnings: ValidationWarning[] },
    FramePodFunctionValidationError
  > =>
    blockOnFailure
      ? new Err(error)
      : new Ok({
          warnings: [
            {
              type: "pod_function",
              message: `${error.message} (${HOOK_BLOCKING_NOTICE})`,
            },
          ],
        });

  const { spaceId } = await file.resolveFrameScopedPathContext(auth);
  if (!spaceId) {
    return frameFailure(
      new FramePodFunctionValidationError(
        "pod_scope_not_found",
        "Frame uses Pod functions but is not scoped to a Pod."
      )
    );
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !space.isProject()) {
    return frameFailure(
      new FramePodFunctionValidationError(
        "pod_scope_not_found",
        "The Frame's Pod is not accessible."
      )
    );
  }

  const sandboxFunctions = await SandboxFunctionResource.listBySpace(
    auth,
    space
  );
  const functionContracts = sandboxFunctions.map((sandboxFunction) => ({
    functionReferences: [
      sandboxFunction.sId,
      `${space.sId}/${sandboxFunction.slug}`,
    ],
    inputSchema: sandboxFunction.inputSchema,
  }));

  const validation = await validateCallFunctionTypes({
    functionContracts,
    sources,
  });
  if (validation.isErr()) {
    return frameFailure(validation.error);
  }

  return validation;
}
