import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Loader, Plugin } from "esbuild";
import path from "path";

/**
 * Reads a module's source tree, abstracted from storage so the engine works over any backend
 * (an in-memory tree, DustFileSystem). Paths are root-relative
 * (e.g. `index.ts`, `components/Chart.tsx`).
 */
export interface SourceReader {
  // Root-relative paths of every file under the module root.
  list(): Promise<string[]>;
  // Read a root-relative file, or null when it does not exist.
  read(relPath: string): Promise<string | null>;
}

export type BundleErrorCode =
  | "build_failed"
  | "entry_not_found"
  | "read_failed";

export class BundleError extends Error {
  constructor(
    readonly code: BundleErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BundleError";
  }
}

/**
 * esbuild output knobs that vary per consumer. Frames build for the browser with JSX preserved and
 * no minification (so data refs stay discoverable). A Function builds for node. Consumers set
 * these explicitly so the engine carries no frame-specific defaults.
 */
export interface BundleEsbuildOptions {
  format: "esm" | "cjs";
  platform: "browser" | "node" | "neutral";
  jsx: "preserve" | "transform" | "automatic";
  minify: boolean;
}

export interface BundleModuleParams {
  // Root-relative path of the entry file (e.g. `index.ts`, `dashboard.tsx`).
  entryRelPath: string;
  reader: SourceReader;
  esbuild: BundleEsbuildOptions;
  /**
   * Per-file transform applied before a file is handed to esbuild, the engine's only
   * consumer-specific seam. Frames use it to stamp JSX source-location tags. Receives the
   * root-relative path and raw contents, returns the (possibly rewritten) contents.
   */
  transform?: (relPath: string, content: string) => string;
}

// Extensions probed, in order, when a relative import omits one (e.g. `./Chart` -> `./Chart.tsx`).
// Resolution is first-match-wins by this order, never an ambiguity error, so the order is the
// tie-breaker when sibling files share a base name (`./Chart` resolves to Chart.tsx over Chart.ts).
// The leading "" matches a specifier that already carries its extension.
const RESOLVE_EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", ".json"] as const;
const BUNDLE_NAMESPACE = "bundle";

function isRelativeSpecifier(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../");
}

function loaderForPath(relPath: string): Loader {
  if (relPath.endsWith(".ts")) {
    return "ts";
  }

  if (relPath.endsWith(".js")) {
    return "js";
  }

  if (relPath.endsWith(".jsx")) {
    return "jsx";
  }

  if (relPath.endsWith(".json")) {
    return "json";
  }

  return "tsx";
}

function isEsbuildFailure(
  err: unknown
): err is { errors: { text?: string }[] } {
  return (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray(err.errors)
  );
}

function formatEsbuildError(err: unknown): string {
  if (isEsbuildFailure(err)) {
    const messages = err.errors
      .map((e) => e.text ?? "")
      .filter((t) => t.length > 0);
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return normalizeError(err).message;
}

/**
 * Bundle a multi-file module into a single self-contained file. Storage- and consumer-agnostic
 * build engine shared by Frames and Functions: it walks a relative-import graph and inlines
 * it.
 *
 * - Relative imports (`./`, `../`) resolve against the module root, with extension probing
 *   (`./Chart` -> `./Chart.tsx`) and directory index resolution (`./components` ->
 *   `./components/index.tsx`). A module reached via several paths (diamond) is inlined once.
 * - Non-relative specifiers (react, zod, scoped data refs, ...) stay external for the runtime
 *   import scope to resolve.
 * - Imports escaping the module root (`../` past the top) are rejected.
 * - Reads go through the async {@link SourceReader}, at any nesting depth.
 *
 * Per-consumer behavior (JSX tagging, browser vs node, minify) comes from `transform` and
 * `esbuild`, not hardcoded here.
 */
export async function bundleModule({
  entryRelPath,
  reader,
  esbuild: esbuildOptions,
  transform,
}: BundleModuleParams): Promise<Result<{ code: string }, BundleError>> {
  const index = new Set(await reader.list());
  if (!index.has(entryRelPath)) {
    return new Err(
      new BundleError(
        "entry_not_found",
        `Entry file not found in module root: ${entryRelPath}`
      )
    );
  }

  // Resolve a relative specifier against the importer, probing known extensions and an index
  // file. Returns the resolved root-relative path or an error marker.
  const resolveRelative = (
    importerRel: string,
    spec: string
  ): { rel: string } | { error: "escape" | "missing" } => {
    const joined = path.posix.normalize(
      path.posix.join(path.posix.dirname(importerRel), spec)
    );
    // TODO(FRAMES BUNDLE): Consider relaxing this to allow imports from pods/ in the conversation.
    if (joined.startsWith("..") || path.posix.isAbsolute(joined)) {
      return { error: "escape" };
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

    // A direct file (with or without extension) wins over a directory index.
    const resolved = probe(joined, true) ?? probe(`${joined}/index`, false);

    return resolved ? { rel: resolved } : { error: "missing" };
  };

  // Captures a read failure inside onLoad so we can surface it as a typed error rather than
  // the generic esbuild build failure.
  let readError: BundleError | null = null;

  const plugin: Plugin = {
    name: "module-source-reader",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") {
          return { path: entryRelPath, namespace: BUNDLE_NAMESPACE };
        }

        if (isRelativeSpecifier(args.path)) {
          const resolved = resolveRelative(args.importer, args.path);
          if ("error" in resolved) {
            const message =
              resolved.error === "escape"
                ? `Refusing import outside module root: "${args.path}" from "${args.importer}"`
                : `Cannot resolve "${args.path}" from "${args.importer}"`;

            return { errors: [{ text: message }] };
          }

          return { path: resolved.rel, namespace: BUNDLE_NAMESPACE };
        }

        // Non-relative specifiers stay external (resolved by the runtime import scope).
        return { path: args.path, external: true };
      });

      build.onLoad(
        { filter: /.*/, namespace: BUNDLE_NAMESPACE },
        async (args) => {
          const content = await reader.read(args.path);
          if (content === null) {
            readError = new BundleError(
              "read_failed",
              `Failed to read module source: ${args.path}`
            );

            return { errors: [{ text: readError.message }] };
          }

          return {
            contents: transform ? transform(args.path, content) : content,
            loader: loaderForPath(args.path),
            resolveDir: "/",
          };
        }
      );
    },
  };

  try {
    // Lazy import: esbuild is a heavy node-only module that breaks under jsdom. Loading it here
    // keeps it out of this engine's consumers' import graph, so they stay importable in any test
    // environment and esbuild is pulled in only when a build runs.
    const { default: esbuild } = await import("esbuild");
    const result = await esbuild.build({
      entryPoints: [entryRelPath],
      bundle: true,
      write: false,
      format: esbuildOptions.format,
      jsx: esbuildOptions.jsx,
      platform: esbuildOptions.platform,
      minify: esbuildOptions.minify,
      sourcemap: false,
      logLevel: "silent",
      plugins: [plugin],
    });

    if (readError) {
      return new Err(readError);
    }

    const output = result.outputFiles[0];
    if (!output) {
      return new Err(
        new BundleError("build_failed", "esbuild produced no output")
      );
    }

    return new Ok({ code: output.text });
  } catch (err) {
    if (readError) {
      return new Err(readError);
    }

    return new Err(new BundleError("build_failed", formatEsbuildError(err)));
  }
}
