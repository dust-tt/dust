import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { build } from "tsup";
import ts from "typescript";

export interface FrameRuntimeTypesManifest {
  version: 1;
  id: string;
  typescriptVersion: string;
  modules: string[];
  path: string;
  tarballSha256: string;
  sizeBytes: number;
}

async function collectDeclarations(vizRoot: string, stageRoot: string) {
  const repositoryRoot = path.dirname(vizRoot);
  const runtimeFileName = path.join(vizRoot, "app/lib/frame-runtime-scope.ts");
  const files = new Map<string, string>();
  const sourceRoots = [
    [path.join(vizRoot, "node_modules"), "viz/node_modules"],
    [path.join(repositoryRoot, "node_modules"), "node_modules"],
  ].flatMap(([source, target]) =>
    fs.existsSync(source)
      ? [
          [source, target],
          [fs.realpathSync(source), target],
        ]
      : [[source, target]]
  );

  function artifactPath(fileName: string): string {
    const normalized = path.resolve(fileName);
    for (const [source, target] of sourceRoots) {
      if (normalized.startsWith(`${source}/`)) {
        return `${target}${normalized.slice(source.length)}`;
      }
    }
    if (normalized.startsWith(`${vizRoot}/`)) {
      return `viz/${path.relative(vizRoot, normalized)}`;
    }
    throw new Error(`Frame declaration is outside Viz: ${fileName}`);
  }

  const configPath = path.join(vizRoot, "tsconfig.frame-runtime.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, vizRoot);
  if (config.error || parsed.errors.length > 0) {
    throw new Error(`Invalid Frame declaration config: ${configPath}`);
  }
  const program = ts.createProgram([runtimeFileName], parsed.options);
  for (const source of program.getSourceFiles()) {
    // Consumers supply their compiler's standard libraries and use browser globals.
    if (
      source.isDeclarationFile &&
      !source.fileName.includes("/node_modules/@types/node/") &&
      !source.fileName.includes("/node_modules/typescript/lib/")
    ) {
      files.set(artifactPath(source.fileName), source.text);
      for (
        let directory = path.dirname(source.fileName);
        directory.includes("/node_modules/");
        directory = path.dirname(directory)
      ) {
        const packagePath = path.join(directory, "package.json");
        if (fs.existsSync(packagePath)) {
          files.set(
            artifactPath(packagePath),
            fs.readFileSync(packagePath, "utf8")
          );
        }
      }
    }
  }

  const runtimeSource = program.getSourceFile(runtimeFileName);
  const factory = runtimeSource?.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "createFrameRuntimeImports"
  );
  if (!runtimeSource || !factory) {
    throw new Error("Frame runtime import factory was not found.");
  }
  const checker = program.getTypeChecker();
  const signature = checker.getSignatureFromDeclaration(factory);
  if (!signature) {
    throw new Error("Frame runtime import factory has no return type.");
  }
  const namespaceImports = new Map<ts.Symbol, string>();
  for (const statement of runtimeSource.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const binding = statement.importClause?.namedBindings;
    if (binding && ts.isNamespaceImport(binding)) {
      const symbol = checker.getSymbolAtLocation(binding.name);
      if (symbol) {
        namespaceImports.set(
          checker.getAliasedSymbol(symbol),
          statement.moduleSpecifier.text
        );
      }
    }
  }
  const modules: Record<string, string[]> = {};
  const entry = [
    `import { createFrameRuntimeImports } from ${JSON.stringify(runtimeFileName.replace(/\.ts$/, ""))};`,
    "type Runtime = ReturnType<typeof createFrameRuntimeImports>;",
  ];
  for (const module of checker
    .getReturnTypeOfSignature(signature)
    .getProperties()) {
    const moduleName = module.getName();
    const moduleType = checker.getTypeOfSymbolAtLocation(module, factory);
    const moduleSymbol = moduleType.getSymbol();
    const moduleImport = moduleSymbol && namespaceImports.get(moduleSymbol);
    const source = moduleSymbol?.getDeclarations()?.[0]?.getSourceFile();
    if (source?.fileName.includes("/node_modules/")) {
      modules[moduleName] = [`./${artifactPath(source.fileName)}`];
      continue;
    }
    const namespace = `library${Object.keys(modules).length}`;
    if (moduleImport) {
      entry.push(
        `import * as ${namespace} from ${JSON.stringify(moduleImport)}; export { ${namespace} };`
      );
    } else {
      entry.push(`export declare namespace ${namespace} {`);
      for (const member of moduleType.getProperties()) {
        const name = member.getName();
        const type = `Runtime[${JSON.stringify(moduleName)}][${JSON.stringify(name)}]`;
        entry.push(`const ${name}: ${type};`);
        if (
          checker.getSignaturesOfType(
            checker.getTypeOfSymbolAtLocation(member, factory),
            ts.SignatureKind.Construct
          ).length > 0
        ) {
          entry.push(`type ${name} = InstanceType<${type}>;`);
        }
      }
      entry.push("}");
    }
    const fileName = `modules/${namespace}.d.ts`;
    files.set(
      fileName,
      `import { ${namespace} } from "../index";\nexport = ${namespace};\n`
    );
    modules[moduleName] = [`./${fileName}`];
  }
  const entryPath = path.join(stageRoot, "entry.ts");
  const bundleDirectory = path.join(stageRoot, "bundle");
  fs.writeFileSync(entryPath, entry.join("\n"));
  await build({
    entry: { index: entryPath },
    tsconfig: configPath,
    dts: { only: true, compilerOptions: { baseUrl: vizRoot } },
    format: ["esm"],
    outDir: bundleDirectory,
    silent: true,
  });
  const outputs = fs.readdirSync(bundleDirectory);
  if (outputs.length !== 1 || !/^index\.d\.[cm]?ts$/.test(outputs[0])) {
    throw new Error("Expected one Frame declaration bundle.");
  }
  files.set(
    "index.d.ts",
    fs.readFileSync(path.join(bundleDirectory, outputs[0]), "utf8")
  );

  // These references resolve to data files or child Frames at render time.
  files.set(
    "node_modules/@types/dust-frame-refs/index.d.ts",
    [
      'declare module "fil_*"',
      'declare module "conversation-*"',
      'declare module "pod-*"',
      'declare module "conversation/*"',
      'declare module "pod/*"',
      'declare module "project/*"',
    ].join("\n")
  );
  files.set(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          lib: ["ESNext", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react",
          strict: true,
          noImplicitAny: false,
          skipLibCheck: true,
          esModuleInterop: true,
          allowUmdGlobalAccess: true,
          allowImportingTsExtensions: true,
          allowJs: true,
          checkJs: true,
          resolveJsonModule: true,
          noEmit: true,
          typeRoots: ["./node_modules/@types", "./viz/node_modules/@types"],
          types: ["react", "dust-frame-refs"],
          paths: modules,
        },
      },
      null,
      2
    )
  );
  const metadata = {
    typescriptVersion: ts.version,
    modules: Object.keys(modules),
  };
  files.set("runtime.json", JSON.stringify(metadata, null, 2));
  return { files, metadata };
}

/**
 * @cc [owner:flvndvd,label:product] frame-types-from-renderer
 * The artifact MUST derive its public modules and bound hook signatures from the actual Frame
 * runtime factory and use Viz's installed dependency declarations. It MUST contain declarations
 * and configuration only, with paths that work after extraction outside this repository.
 * Viz's own declarations MUST be bundled with standard declaration tooling.
 */
/**
 * @cc [owner:flvndvd,label:product] frame-types-cache-identity
 * Identical artifact paths and contents MUST produce the same id. The manifest MUST identify
 * the archive by its byte checksum and only become visible after the archive is written.
 */
/**
 * @cc [owner:flvndvd,label:error-handling] frame-types-build-failure
 * This build-only entry point and its helpers MAY throw on missing or invalid declarations or
 * filesystem failures. Such failures MUST abort the build instead of publishing partial types.
 */
export async function buildFrameRuntimeTypes({
  vizRoot,
  outDir,
}: {
  vizRoot: string;
  outDir: string;
}): Promise<FrameRuntimeTypesManifest> {
  const stageRoot = fs.mkdtempSync(path.join(vizRoot, ".frame-runtime-"));
  try {
    const { files, metadata } = await collectDeclarations(vizRoot, stageRoot);
    const treeHash = createHash("sha256");
    const entries = Array.from(files.entries()).sort(([left], [right]) => {
      if (left === right) {
        return 0;
      }
      return left < right ? -1 : 1;
    });
    for (const [fileName, content] of entries) {
      treeHash.update(fileName).update("\0").update(content).update("\0");
      const target = path.join(stageRoot, "types", fileName);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    const id = treeHash.digest("hex");
    const archivePath = path.join(stageRoot, "types.tgz");
    execFileSync("tar", [
      "-czf",
      archivePath,
      "-C",
      path.join(stageRoot, "types"),
      ".",
    ]);
    const archive = fs.readFileSync(archivePath);
    const tarballSha256 = createHash("sha256").update(archive).digest("hex");
    const manifest: FrameRuntimeTypesManifest = {
      version: 1,
      id,
      ...metadata,
      path: `/frame-runtime/${tarballSha256}.tgz`,
      tarballSha256,
      sizeBytes: archive.byteLength,
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${tarballSha256}.tgz`), archive);
    const manifestPath = path.join(outDir, `.manifest-${randomUUID()}.json`);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.renameSync(manifestPath, path.join(outDir, "manifest.json"));
    return manifest;
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}
