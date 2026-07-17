import path from "node:path";
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

export type FramePodFunctionValidationErrorCode =
  | "invalid_pod_function_input"
  | "pod_function_not_found"
  | "pod_function_schema_invalid"
  | "pod_scope_not_found";

export class FramePodFunctionValidationError extends Error {
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

function sourceMayCallPodFunction(relPath: string, code: string): boolean {
  const sourceFile = ts.createSourceFile(
    relPath,
    code,
    ts.ScriptTarget.Latest,
    false,
    relPath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
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
      if (
        bindings.elements.some(
          (element) =>
            (element.propertyName?.text ?? element.name.text) === "callFunction"
        )
      ) {
        return true;
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      namespaceImports.add(bindings.name.text);
    }
  }

  if (namespaceImports.size === 0) {
    return false;
  }

  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      namespaceImports.has(node.expression.text) &&
      node.name.text === "callFunction"
    ) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return found;
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

  // Return values stay permissive because this pass only validates calls.
  return new Ok(`${declarations.join("\n")}
export interface PodFunctionMap {
${entries.join("\n")}
}

export declare function callFunction<TFunction extends keyof PodFunctionMap>(
  functionId: TFunction,
  input: PodFunctionMap[TFunction]
): any;
`);
}

type ClassifiedDiagnostic = {
  diagnostic: ts.Diagnostic;
  type: "input" | "reference";
};

function classifyDiagnostic(
  diagnostic: ts.Diagnostic,
  call: ts.CallExpression
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
    return { diagnostic, type: "reference" };
  }

  const inputArgument = call.arguments[1];
  if (
    inputArgument !== undefined &&
    INPUT_DIAGNOSTIC_CODES.has(diagnostic.code) &&
    diagnostic.start >= inputArgument.getStart() &&
    diagnostic.start < inputArgument.getEnd()
  ) {
    return { diagnostic, type: "input" };
  }

  if (CALL_DIAGNOSTIC_CODES.has(diagnostic.code)) {
    return {
      diagnostic,
      type: functionArgument ? "input" : "reference",
    };
  }

  return undefined;
}

function classifyDiagnostics(
  calls: readonly ts.CallExpression[],
  diagnostics: readonly ts.Diagnostic[]
): ClassifiedDiagnostic[] {
  const sortedCalls = [...calls].sort(
    (left, right) =>
      left.getStart() - right.getStart() || right.getEnd() - left.getEnd()
  );
  const sortedDiagnostics = diagnostics
    .filter(
      (diagnostic): diagnostic is ts.Diagnostic & { start: number } =>
        diagnostic.start !== undefined
    )
    .sort((left, right) => left.start - right.start);
  const activeCalls: ts.CallExpression[] = [];
  const classified: ClassifiedDiagnostic[] = [];
  let callIndex = 0;

  // Call ranges are nested or disjoint, so one sweep finds the innermost call.
  for (const diagnostic of sortedDiagnostics) {
    while (
      callIndex < sortedCalls.length &&
      sortedCalls[callIndex].getStart() <= diagnostic.start
    ) {
      const call = sortedCalls[callIndex];
      while (
        activeCalls.length > 0 &&
        activeCalls[activeCalls.length - 1].getEnd() <= call.getStart()
      ) {
        activeCalls.pop();
      }
      activeCalls.push(call);
      callIndex++;
    }

    while (
      activeCalls.length > 0 &&
      activeCalls[activeCalls.length - 1].getEnd() <= diagnostic.start
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

async function validateCallFunctionTypes({
  functionContracts,
  sources,
}: {
  functionContracts: readonly PodFunctionContract[];
  sources: ReadonlyMap<string, string>;
}): Promise<Result<undefined, FramePodFunctionValidationError>> {
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
  const callFunctionCallsBySource = new Map<
    ts.SourceFile,
    ts.CallExpression[]
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
        if (
          signatures.some(
            (signature) =>
              signature.declaration?.getSourceFile().fileName ===
              VIRTUAL_DUST_REACT_HOOKS_PATH
          )
        ) {
          const calls = callFunctionCallsBySource.get(sourceFile) ?? [];
          calls.push(node);
          callFunctionCallsBySource.set(sourceFile, calls);
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const diagnosticsBySource = new Map<ts.SourceFile, ts.Diagnostic[]>();
  for (const diagnostic of program.getSemanticDiagnostics()) {
    if (!diagnostic.file || !callFunctionCallsBySource.has(diagnostic.file)) {
      continue;
    }

    const diagnostics = diagnosticsBySource.get(diagnostic.file) ?? [];
    diagnostics.push(diagnostic);
    diagnosticsBySource.set(diagnostic.file, diagnostics);
  }

  const diagnostics = Array.from(callFunctionCallsBySource).flatMap(
    ([sourceFile, calls]) =>
      classifyDiagnostics(calls, diagnosticsBySource.get(sourceFile) ?? [])
  );

  if (diagnostics.length > 0) {
    const hasInvalidReference = diagnostics.some(
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
        }:\n${diagnostics
          .slice(0, 5)
          .map(({ diagnostic }) => formatDiagnostic(diagnostic))
          .join("\n")}`
      )
    );
  }

  return new Ok(undefined);
}

/**
 * Statically checks Pod function references and the structure of their inputs.
 * Pod contracts are authored in Zod, but this check uses their extracted JSON Schema. Runtime-only
 * refinements and value constraints are not always expressible as TypeScript types, so an input can
 * pass here and still fail the authoritative Zod validation when the function runs.
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
): Promise<Result<undefined, FramePodFunctionValidationError>> {
  const mayCallPodFunction = Array.from(sources).some(
    ([relPath, code]) =>
      isSourceFile(relPath) && sourceMayCallPodFunction(relPath, code)
  );
  if (!mayCallPodFunction) {
    return new Ok(undefined);
  }

  const { spaceId } = await file.resolveFrameScopedPathContext(auth);
  if (!spaceId) {
    return new Err(
      new FramePodFunctionValidationError(
        "pod_scope_not_found",
        "Frame uses Pod functions but is not scoped to a Pod."
      )
    );
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !space.isProject()) {
    return new Err(
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

  return validateCallFunctionTypes({ functionContracts, sources });
}
