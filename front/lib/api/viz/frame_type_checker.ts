import path from "node:path";
import ts from "typescript";
import type {
  FrameDiagnostic,
  FrameValidationSnapshot,
} from "./frame_type_checker_types.ts";

const SOURCE_ROOT = "/frame-source";
const TYPE_ROOT = "/frame-types";

/**
 * @cc [owner:flvndvd,label:security] frame-validation-isolation
 * Validation MUST only read the entry's source dependencies and the supplied type snapshot.
 * It MUST NOT execute Frame code or resolve libraries from the sandbox's installed packages.
 * A dependency present only for a library's types MUST NOT become a permitted Frame import.
 */
export function validateFrameSource({
  snapshot,
  entryPoint,
  readSource,
}: {
  snapshot: FrameValidationSnapshot;
  entryPoint: string;
  readSource: (relativePath: string) => string | undefined;
}): FrameDiagnostic[] {
  const sourceCache = new Map<string, string | undefined>();
  function readFile(fileName: string): string | undefined {
    if (fileName.startsWith(`${TYPE_ROOT}/`)) {
      return Object.hasOwn(snapshot.files, fileName)
        ? snapshot.files[fileName]
        : undefined;
    }
    if (!fileName.startsWith(`${SOURCE_ROOT}/`)) {
      return undefined;
    }
    if (!sourceCache.has(fileName)) {
      sourceCache.set(
        fileName,
        readSource(fileName.slice(SOURCE_ROOT.length + 1))
      );
    }
    return sourceCache.get(fileName);
  }
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.React,
    strict: true,
    noImplicitAny: false,
    allowJs: true,
    checkJs: true,
    allowImportingTsExtensions: true,
    allowUmdGlobalAccess: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
    resolveJsonModule: true,
    types: [],
    baseUrl: `${TYPE_ROOT}/viz`,
    paths: { "@viz/*": ["./*"] },
  };
  const fileExists = (fileName: string) => readFile(fileName) !== undefined;
  const host: ts.CompilerHost = {
    readFile,
    fileExists,
    getSourceFile: (fileName, languageVersion) => {
      const content = readFile(fileName);
      return content === undefined
        ? undefined
        : ts.createSourceFile(fileName, content, languageVersion, true);
    },
    getDefaultLibFileName: () => snapshot.defaultLibFileName,
    getCurrentDirectory: () => SOURCE_ROOT,
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    writeFile: () => undefined,
    resolveModuleNames: (moduleNames, containingFile) =>
      moduleNames.map((moduleName) => {
        if (containingFile.startsWith(`${SOURCE_ROOT}/`)) {
          const moduleFileName = Object.hasOwn(snapshot.modules, moduleName)
            ? snapshot.modules[moduleName]
            : undefined;
          if (moduleFileName) {
            return {
              resolvedFileName: moduleFileName,
              extension: ts.Extension.Dts,
            };
          }
          if (!moduleName.startsWith("./") && !moduleName.startsWith("../")) {
            return undefined;
          }
          if (
            !path.posix
              .resolve(path.posix.dirname(containingFile), moduleName)
              .startsWith(`${SOURCE_ROOT}/`)
          ) {
            return undefined;
          }
          // Match the Frame bundler's resolution order, including colliding .tsx/.ts siblings.
          const base = path.posix.resolve(
            path.posix.dirname(containingFile),
            moduleName
          );
          const extensions = ["", ".tsx", ".ts", ".jsx", ".js", ".json"];
          const candidates = [
            ...extensions.map((extension) => `${base}${extension}`),
            ...extensions
              .slice(1)
              .map((extension) => `${base}/index${extension}`),
          ];
          const resolvedFileName = candidates.find(fileExists);
          return resolvedFileName ? { resolvedFileName } : undefined;
        }
        return ts.resolveModuleName(moduleName, containingFile, options, {
          fileExists,
          readFile,
        }).resolvedModule;
      }),
  };
  const entryFileName = path.posix.resolve(SOURCE_ROOT, entryPoint);
  if (!entryFileName.startsWith(`${SOURCE_ROOT}/`)) {
    return [
      {
        file: entryPoint,
        line: 1,
        column: 1,
        code: 6053,
        message: "The Frame entry must be inside its source directory.",
      },
    ];
  }
  const program = ts.createProgram(
    [entryFileName, snapshot.modules.react, `${TYPE_ROOT}/dust-file-refs.d.ts`],
    options,
    host
  );
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const position =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : { line: 0, character: 0 };
    return {
      file: diagnostic.file?.fileName.startsWith(`${SOURCE_ROOT}/`)
        ? diagnostic.file.fileName.slice(SOURCE_ROOT.length + 1)
        : entryPoint,
      line: position.line + 1,
      column: position.character + 1,
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    };
  });
}
