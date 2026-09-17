import path from "node:path";
import ts from "typescript";
import { collectDependencyDeclarations } from "./dependencies.ts";

export function inspectFrameRuntime(vizRoot: string) {
  const runtimeFileName = path.join(vizRoot, "app/lib/frame-runtime-scope.ts");
  const configPath = path.join(vizRoot, "tsconfig.frame-runtime.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, vizRoot);
  if (config.error || parsed.errors.length > 0) {
    throw new Error(`Invalid Frame declaration config: ${configPath}`);
  }
  const program = ts.createProgram([runtimeFileName], parsed.options);
  const dependencies = collectDependencyDeclarations(
    vizRoot,
    program.getSourceFiles()
  );
  const files = new Map(dependencies.files);
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
      const declarationPath = dependencies.modulePaths.get(source.fileName);
      if (!declarationPath) {
        throw new Error(`Missing declarations for Frame module ${moduleName}.`);
      }
      modules[moduleName] = [declarationPath];
      continue;
    }
    const namespace = `library${Object.keys(modules).length}`;
    if (moduleImport) {
      // Keep interfaces and type aliases when re-exporting a local library.
      entry.push(
        `import * as ${namespace} from ${JSON.stringify(moduleImport)}; export { ${namespace} };`
      );
    } else {
      entry.push(`export declare namespace ${namespace} {`);
      for (const member of moduleType.getProperties()) {
        const name = member.getName();
        const type = `Runtime[${JSON.stringify(moduleName)}][${JSON.stringify(name)}]`;
        entry.push(`const ${name}: ${type};`);
        // A class can be imported as both a value and an instance type.
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
  return { files, modules, entrySource: entry.join("\n"), configPath };
}
