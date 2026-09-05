import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { FrameRuntimeImportName } from "@viz/app/lib/frame-runtime-imports";
import { FRAME_RUNTIME_IMPORT_NAMES } from "@viz/app/lib/frame-runtime-imports";
import ts from "typescript";

/**
 * Builds the Frame runtime types artifact: a tarball holding every type declaration needed to
 * type-check Frame UI source against the modules VisualizationWrapper exposes at runtime. Viz
 * generates it at build time and serves it from `public/frame-runtime/`; Front installs it in the
 * publishing sandbox and runs `tsc` against it. Because it is generated from the real runtime
 * modules and the real installed packages, it cannot drift from what Frames get at render time.
 *
 * Layout of the extracted artifact:
 * - `tsconfig.json`: compiler options and `paths` mapping each runtime import name to its
 *   declaration file. Consumers extend it and add the files to check.
 * - `viz/**`: declarations emitted from Viz's own runtime sources (shadcn, utils, slideshow,
 *   the `@dust/react-hooks` contract).
 * - `node_modules/**`: the declaration files and package manifests of every package the above
 *   reaches, copied from the versions Viz has installed.
 * - `node_modules/@types/dust-frame-refs`: ambient modules for Dust file references.
 */

// Source module behind each runtime import name. `frame-runtime-modules.test.ts` checks these
// resolve to the very modules the renderer exposes under the same names.
export const FRAME_RUNTIME_MODULE_SOURCES = {
  papaparse: "papaparse",
  react: "react",
  recharts: "recharts",
  shadcn: "@viz/components/ui",
  utils: "@viz/lib/utils",
  "@viz/lib/utils": "@viz/lib/utils",
  "lucide-react": "lucide-react",
  "motion/react": "motion/react",
  "@dust/slideshow/v1": "@viz/components/dust/slideshow/v1",
  "@dust/slideshow/v2": "@viz/components/dust/slideshow/v2",
  "@dust/react-hooks": "@viz/app/lib/frame-runtime/react-hooks",
} as const satisfies Record<FrameRuntimeImportName, string>;

// Mirrors the file reference forms `parseFileRefs.ts` accepts, so `import data from
// "conversation-<id>/data.json"` type-checks as `any` instead of an unresolved module.
const FRAME_FILE_REFERENCE_MODULE_PATTERNS = [
  "fil_*",
  "conversation-*",
  "pod-*",
  "conversation/*",
  "pod/*",
  "project/*",
];

const FRAME_REFS_TYPES_PACKAGE = "dust-frame-refs";

export const FRAME_RUNTIME_TYPES_MANIFEST_VERSION = 1;

export interface FrameRuntimeTypesManifest {
  version: typeof FRAME_RUNTIME_TYPES_MANIFEST_VERSION;
  // Content hash of the extracted tree; consumers key their install directory on it, so a
  // rebuild of identical sources never re-installs.
  id: string;
  // URL path of the tarball, relative to the Viz origin. Named after `tarballSha256`.
  path: string;
  tarballSha256: string;
  sizeBytes: number;
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  });
}

function readVizCompilerOptions(vizRoot: string): ts.CompilerOptions {
  const configPath = path.join(vizRoot, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(formatDiagnostics([configFile.error]));
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    vizRoot
  );
  if (parsed.errors.length > 0) {
    throw new Error(formatDiagnostics(parsed.errors));
  }

  return parsed.options;
}

function resolveRuntimeModule(
  specifier: string,
  vizRoot: string,
  options: ts.CompilerOptions
): string {
  const resolved = ts.resolveModuleName(
    specifier,
    path.join(vizRoot, "__frame_runtime_anchor__.ts"),
    options,
    ts.sys
  ).resolvedModule;
  if (!resolved) {
    throw new Error(`Cannot resolve Frame runtime module "${specifier}".`);
  }

  return resolved.resolvedFileName;
}

function isDeclarationFile(fileName: string): boolean {
  return /\.d\.[cm]?ts$/.test(fileName);
}

function toDeclarationFileName(fileName: string): string {
  if (isDeclarationFile(fileName)) {
    return fileName;
  }

  return fileName.replace(/\.(?:tsx|ts|jsx|js|mts|cts)$/, ".d.ts");
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) {
      continue;
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  return files.sort();
}

export function buildFrameRuntimeTypes({
  vizRoot,
  outDir,
}: {
  vizRoot: string;
  outDir: string;
}): FrameRuntimeTypesManifest {
  const vizOptions = readVizCompilerOptions(vizRoot);
  const nodeModulesMarker = `${path.sep}node_modules${path.sep}`;

  const runtimeSourceFiles = new Map<FrameRuntimeImportName, string>();
  for (const importName of FRAME_RUNTIME_IMPORT_NAMES) {
    runtimeSourceFiles.set(
      importName,
      resolveRuntimeModule(
        FRAME_RUNTIME_MODULE_SOURCES[importName],
        vizRoot,
        vizOptions
      )
    );
  }

  const stageRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "dust-frame-runtime-types-")
  );
  try {
    const stagedVizDir = path.join(stageRoot, "viz");
    const stagedNodeModulesDir = path.join(stageRoot, "node_modules");

    // Only the runtime modules are roots; TypeScript pulls in everything they reach.
    const emitOptions: ts.CompilerOptions = {
      ...vizOptions,
      declaration: true,
      declarationMap: false,
      emitDeclarationOnly: true,
      incremental: false,
      composite: false,
      noEmit: false,
      outDir: stagedVizDir,
      plugins: undefined,
      rootDir: vizRoot,
      sourceMap: false,
      tsBuildInfoFile: undefined,
      types: [],
    };
    const program = ts.createProgram({
      rootNames: Array.from(runtimeSourceFiles.values()),
      options: emitOptions,
    });

    const isVizSource = (fileName: string) =>
      fileName.startsWith(`${vizRoot}${path.sep}`) &&
      !fileName.includes(nodeModulesMarker);
    const preEmitDiagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter(
        (diagnostic) =>
          diagnostic.category === ts.DiagnosticCategory.Error &&
          (!diagnostic.file || isVizSource(diagnostic.file.fileName))
      );
    if (preEmitDiagnostics.length > 0) {
      throw new Error(
        `Frame runtime sources do not type-check:\n${formatDiagnostics(preEmitDiagnostics)}`
      );
    }

    const emitResult = program.emit(undefined, undefined, undefined, true);
    const emitErrors = emitResult.diagnostics.filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
    );
    if (emitErrors.length > 0) {
      throw new Error(
        `Frame runtime declaration emit failed:\n${formatDiagnostics(emitErrors)}`
      );
    }

    const copiedPackageManifests = new Set<string>();
    const copyPackageManifests = (packageFilePath: string) => {
      // Copy every package.json between the file and its enclosing node_modules directory so
      // package entry points and subpath exports resolve inside the artifact.
      let directory = path.dirname(packageFilePath);
      while (path.basename(directory) !== "node_modules") {
        const manifestPath = path.join(directory, "package.json");
        if (
          !copiedPackageManifests.has(manifestPath) &&
          fs.existsSync(manifestPath)
        ) {
          copiedPackageManifests.add(manifestPath);
          const relative = manifestPath.slice(
            manifestPath.indexOf(nodeModulesMarker) + nodeModulesMarker.length
          );
          const target = path.join(stagedNodeModulesDir, relative);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(manifestPath, target);
        }
        const parent = path.dirname(directory);
        if (parent === directory) {
          break;
        }
        directory = parent;
      }
    };

    for (const sourceFile of program.getSourceFiles()) {
      const { fileName } = sourceFile;
      const markerIndex = fileName.indexOf(nodeModulesMarker);
      if (markerIndex !== -1) {
        // The sandbox compiler ships its own default libraries.
        if (
          fileName.includes(
            `${nodeModulesMarker}typescript${path.sep}lib${path.sep}`
          )
        ) {
          continue;
        }
        const relative = fileName.slice(markerIndex + nodeModulesMarker.length);
        const target = path.join(stagedNodeModulesDir, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(fileName, target);
        copyPackageManifests(fileName);
      } else if (isVizSource(fileName) && isDeclarationFile(fileName)) {
        // Declaration emit skips inputs that are already declarations.
        const target = path.join(
          stagedVizDir,
          path.relative(vizRoot, fileName)
        );
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(fileName, target);
      }
    }

    const frameRefsDir = path.join(
      stagedNodeModulesDir,
      "@types",
      FRAME_REFS_TYPES_PACKAGE
    );
    fs.mkdirSync(frameRefsDir, { recursive: true });
    fs.writeFileSync(
      path.join(frameRefsDir, "index.d.ts"),
      `${FRAME_FILE_REFERENCE_MODULE_PATTERNS.map(
        (pattern) => `declare module ${JSON.stringify(pattern)};`
      ).join("\n")}\n`
    );
    fs.writeFileSync(
      path.join(frameRefsDir, "package.json"),
      `${JSON.stringify(
        {
          name: `@types/${FRAME_REFS_TYPES_PACKAGE}`,
          version: "1.0.0",
          types: "index.d.ts",
        },
        null,
        2
      )}\n`
    );

    const toStagedPath = (fileName: string): string => {
      const markerIndex = fileName.indexOf(nodeModulesMarker);
      const staged =
        markerIndex !== -1
          ? path.join(
              stagedNodeModulesDir,
              fileName.slice(markerIndex + nodeModulesMarker.length)
            )
          : path.join(
              stagedVizDir,
              toDeclarationFileName(path.relative(vizRoot, fileName))
            );
      if (!fs.existsSync(staged)) {
        throw new Error(`Staged declaration missing for ${fileName}.`);
      }

      return `./${path.relative(stageRoot, staged).split(path.sep).join("/")}`;
    };
    const paths: Record<string, string[]> = {
      "@viz/*": ["./viz/*"],
    };
    runtimeSourceFiles.forEach((fileName, importName) => {
      paths[importName] = [toStagedPath(fileName)];
    });
    // Mirrors Viz's own compiler options where they affect Frame source; `paths` and
    // `typeRoots` are relative to this file, so consumers extend it from anywhere.
    const artifactTsconfig = {
      compilerOptions: {
        allowJs: true,
        allowSyntheticDefaultImports: true,
        baseUrl: ".",
        checkJs: false,
        esModuleInterop: true,
        isolatedModules: false,
        jsx: "preserve",
        lib: ["dom", "dom.iterable", "esnext"],
        module: "esnext",
        moduleResolution: "bundler",
        noEmit: true,
        paths,
        resolveJsonModule: true,
        skipLibCheck: true,
        strict: true,
        target: "es2020",
        typeRoots: ["./node_modules/@types"],
        types: ["react", FRAME_REFS_TYPES_PACKAGE],
      },
    };
    fs.writeFileSync(
      path.join(stageRoot, "tsconfig.json"),
      `${JSON.stringify(artifactTsconfig, null, 2)}\n`
    );

    const treeHash = createHash("sha256");
    for (const filePath of walkFiles(stageRoot)) {
      treeHash.update(path.relative(stageRoot, filePath));
      treeHash.update("\0");
      treeHash.update(fs.readFileSync(filePath));
      treeHash.update("\0");
    }
    const id = treeHash.digest("hex");

    fs.mkdirSync(outDir, { recursive: true });
    for (const entry of fs.readdirSync(outDir)) {
      if (entry.endsWith(".tgz")) {
        fs.rmSync(path.join(outDir, entry));
      }
    }
    // tar and gzip embed timestamps, so two builds of the same tree produce different bytes. The
    // file is named after the bytes it holds so a URL can never serve two different tarballs.
    const stagedTarballPath = path.join(outDir, ".frame-runtime.tgz");
    execFileSync("tar", ["-czf", stagedTarballPath, "-C", stageRoot, "."], {
      stdio: "pipe",
    });
    const tarball = fs.readFileSync(stagedTarballPath);
    const tarballSha256 = sha256(tarball);
    const tarballName = `${tarballSha256}.tgz`;
    fs.renameSync(stagedTarballPath, path.join(outDir, tarballName));
    const manifest: FrameRuntimeTypesManifest = {
      version: FRAME_RUNTIME_TYPES_MANIFEST_VERSION,
      id,
      path: `/frame-runtime/${tarballName}`,
      tarballSha256,
      sizeBytes: tarball.byteLength,
    };
    fs.writeFileSync(
      path.join(outDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );

    return manifest;
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}
