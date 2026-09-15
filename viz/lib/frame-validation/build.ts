import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { FrameValidationSnapshot } from "../../../front/lib/api/viz/frame_type_checker_types.ts";

const TYPE_ROOT = "/frame-types";

/**
 * @cc [owner:flvndvd,label:product] frame-types-from-renderer
 * The snapshot MUST use the renderer's installed TypeScript and dependency declarations.
 * Module names and bound hook exports MUST come from createFrameRuntimeImports, without a
 * separately maintained export list. Missing declarations MUST fail the build.
 */
export function buildFrameValidationSnapshot(
  vizRoot: string
): FrameValidationSnapshot {
  const repositoryRoot = path.dirname(vizRoot);
  const runtimeFileName = path.join(vizRoot, "app/lib/frame-runtime-scope.ts");
  const outputDirectory = path.join(vizRoot, ".frame-validation-types");
  const files: Record<string, string> = {};
  const sourceRoots = [
    [path.join(vizRoot, "node_modules"), `${TYPE_ROOT}/viz/node_modules`],
    [path.join(repositoryRoot, "node_modules"), `${TYPE_ROOT}/node_modules`],
  ].flatMap(([source, target]) =>
    fs.existsSync(source)
      ? [
          [source, target],
          [fs.realpathSync(source), target],
        ]
      : [[source, target]]
  );

  function virtualPath(fileName: string): string {
    const normalized = path.resolve(fileName);
    for (const [source, target] of sourceRoots) {
      if (normalized.startsWith(`${source}/`)) {
        return `${target}${normalized.slice(source.length)}`;
      }
    }
    if (normalized.startsWith(`${repositoryRoot}/`)) {
      return `${TYPE_ROOT}${normalized.slice(repositoryRoot.length)}`;
    }
    throw new Error(
      `Frame declaration is outside the viz dependency tree: ${fileName}`
    );
  }

  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    declaration: true,
    emitDeclarationOnly: true,
    rootDir: vizRoot,
    outDir: outputDirectory,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    preserveSymlinks: true,
    types: [],
    baseUrl: vizRoot,
    paths: { "@viz/*": ["./*"] },
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile;
  host.readFile = (fileName) => {
    const content = readFile(fileName);
    if (content !== undefined && fileName.endsWith("/package.json")) {
      files[virtualPath(fileName)] = content;
    }
    return content;
  };
  host.writeFile = (fileName, content) => {
    const sourcePath = path.join(
      vizRoot,
      path.relative(outputDirectory, fileName)
    );
    files[virtualPath(sourcePath)] = content;
  };

  const program = ts.createProgram([runtimeFileName], options, host);
  const diagnostics = [
    ...program.getOptionsDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getDeclarationDiagnostics(),
    ...program
      .getSemanticDiagnostics()
      .filter((diagnostic) => [2307, 2688, 7016].includes(diagnostic.code)),
  ];
  if (diagnostics.length > 0) {
    throw new Error(
      ts.formatDiagnostics(diagnostics, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => vizRoot,
        getNewLine: () => "\n",
      })
    );
  }
  const emitted = program.emit();
  if (emitted.emitSkipped || emitted.diagnostics.length > 0) {
    throw new Error("Could not emit Frame runtime declarations.");
  }
  for (const source of program.getSourceFiles()) {
    if (
      source.isDeclarationFile &&
      !source.fileName.includes("/node_modules/@types/node/")
    ) {
      files[virtualPath(source.fileName)] = source.text;
    }
  }

  // Data files and child Frames are resolved dynamically by viz. Their shapes are not static.
  files[`${TYPE_ROOT}/dust-file-refs.d.ts`] = [
    'declare module "fil_*"',
    'declare module "conversation-*"',
    'declare module "pod-*"',
    'declare module "conversation/*"',
    'declare module "pod/*"',
    'declare module "project/*"',
  ].join("\n");

  const runtimeSource = program.getSourceFile(runtimeFileName);
  const factory = runtimeSource?.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "createFrameRuntimeImports"
  );
  if (!factory) {
    throw new Error("Frame runtime import factory was not found.");
  }
  const checker = program.getTypeChecker();
  const signature = checker.getSignatureFromDeclaration(factory);
  if (!signature) {
    throw new Error("Frame runtime import factory has no return type.");
  }
  const modules: Record<string, string> = {};
  for (const module of checker
    .getReturnTypeOfSignature(signature)
    .getProperties()) {
    const moduleName = module.getName();
    const moduleType = checker.getTypeOfSymbolAtLocation(module, factory);
    const declaration = moduleType
      .getSymbol()
      ?.getDeclarations()
      ?.find((node) => ts.isSourceFile(node) || ts.isModuleDeclaration(node));
    const source = declaration?.getSourceFile();
    if (source) {
      const fileName = virtualPath(source.fileName).replace(
        /(?<!\.d)\.tsx?$/,
        ".d.ts"
      );
      if (!(fileName in files)) {
        throw new Error(`Missing declarations for Frame module ${moduleName}.`);
      }
      modules[moduleName] = fileName;
      continue;
    }

    const fileName = `${TYPE_ROOT}/modules/${Object.keys(modules).length}.d.ts`;
    const runtimeDeclaration = virtualPath(runtimeFileName).replace(
      /\.ts$/,
      ""
    );
    const lines = [
      `type Module = ReturnType<typeof import(${JSON.stringify(runtimeDeclaration)}).createFrameRuntimeImports>[${JSON.stringify(moduleName)}];`,
    ];
    for (const member of moduleType.getProperties()) {
      const memberName = member.getName();
      lines.push(
        `export declare const ${memberName}: Module[${JSON.stringify(memberName)}];`
      );
      if (
        checker.getSignaturesOfType(
          checker.getTypeOfSymbolAtLocation(member, factory),
          ts.SignatureKind.Construct
        ).length > 0
      ) {
        lines.push(
          `export type ${memberName} = InstanceType<Module[${JSON.stringify(memberName)}]>;`
        );
      }
    }
    files[fileName] = `${lines.join("\n")}\n`;
    modules[moduleName] = fileName;
  }

  return {
    typescriptVersion: ts.version,
    defaultLibFileName: virtualPath(ts.getDefaultLibFilePath(options)),
    files,
    modules,
  };
}
