import type {
  BundleEsbuildOptions,
  SourceReader,
} from "@app/lib/api/bundler/bundle_module";
import { BundleError, bundleModule } from "@app/lib/api/bundler/bundle_module";
import type { DustFileSystem } from "@app/lib/api/file_system";
import { validateTypeScriptSyntax } from "@app/lib/api/files/content_validation";
import { injectSourceLocationTags } from "@app/lib/api/viz/source_location_tags";
import { validateFrameTypes } from "@app/lib/api/viz/validate_frame_types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

// A frame's source tree reader, the generic engine reader under a frame-named alias.
export type FrameSourceReader = SourceReader;

class FrameSyntaxError extends Error {
  readonly code = "invalid_syntax";

  constructor(message: string) {
    super(message);
    this.name = "FrameSyntaxError";
  }
}

// Frames render in an iframe via `react-runner`, which transpiles JSX, so JSX is preserved. Output
// targets the browser and is not minified so data refs (`fil_...`) stay discoverable by
// `extract_file_refs`.
const FRAME_ESBUILD_OPTIONS: BundleEsbuildOptions = {
  format: "esm",
  jsx: "preserve",
  platform: "browser",
  minify: false,
};

/**
 * Validate and bundle a Frame for both legacy and v2 publishing. The generic engine walks the
 * import graph. This wrapper validates source syntax before tagging JSX for live edits.
 */
/**
 * @cc [owner:flvndvd,label:product] frame-source-syntax-validation
 * Syntax errors in .ts, .tsx, .js, and .jsx sources read for the bundle MUST fail the build with
 * `invalid_syntax` and diagnostics identifying the source path and original line/column. These
 * diagnostics MUST take precedence over generic bundler errors.
 * Validation MUST use the source file's language mode so JavaScript rejects TypeScript syntax.
 */
/**
 * @cc [owner:flvndvd,label:performance] validate-only-bundled-frame-sources
 * Syntax validation MUST use the same source contents read by the bundler and MUST NOT read or
 * validate files outside the entry's dependency graph.
 */
export async function buildFrameBundle({
  entryRelPath,
  reader,
}: {
  entryRelPath: string;
  reader: FrameSourceReader;
}): Promise<Result<{ code: string }, BundleError | FrameSyntaxError>> {
  const syntaxErrors: string[] = [];
  const sourcePaths = [...(await reader.list())];
  const sourceCache = new Map<string, string | null>();
  const cachedReader: FrameSourceReader = {
    list: async () => sourcePaths,
    read: async (relativePath) => {
      if (!sourceCache.has(relativePath)) {
        sourceCache.set(relativePath, await reader.read(relativePath));
      }
      return sourceCache.get(relativePath) ?? null;
    },
  };
  const result = await bundleModule({
    entryRelPath,
    reader: {
      list: () => cachedReader.list(),
      read: async (relPath) => {
        const content = await cachedReader.read(relPath);
        if (content !== null && /\.(?:tsx?|jsx?)$/.test(relPath)) {
          const syntax = validateTypeScriptSyntax(content, relPath);
          if (syntax.isErr()) {
            syntaxErrors.push(`${relPath}:\n${syntax.error.message}`);
          }
        }

        return content;
      },
    },
    esbuild: FRAME_ESBUILD_OPTIONS,
    // Stamp each source file with `data-source` tags before inlining so the rendered bundle keeps
    // the origin of every JSX element for live edits.
    transform: injectSourceLocationTags,
  });

  if (syntaxErrors.length > 0) {
    return new Err(new FrameSyntaxError(syntaxErrors.join("\n\n")));
  }

  if (result.isErr()) {
    return result;
  }
  const typeCheck = await validateFrameTypes({
    entryRelPath,
    reader: cachedReader,
  });
  if (typeCheck.isErr()) {
    return new Err(new BundleError("build_failed", typeCheck.error.message));
  }

  return result;
}

/**
 * Adapter exposing a frame's mount subtree (rooted at `rootScopedPath`, e.g.
 * `conversation-<cId>/dashboards/sales`) as a {@link FrameSourceReader}.
 */
export function createMountFrameSourceReader(
  dustFs: DustFileSystem,
  rootScopedPath: string
): FrameSourceReader {
  const root = rootScopedPath.replace(/\/+$/, "");
  const prefix = `${root}/`;

  return {
    async list(): Promise<string[]> {
      const listResult = await dustFs.list(root);
      if (listResult.isErr()) {
        logger.warn(
          { err: listResult.error, root },
          "buildFrameBundle: failed to list frame root"
        );

        return [];
      }

      return listResult.value
        .filter((entry) => !entry.isDirectory && entry.path.startsWith(prefix))
        .map((entry) => entry.path.slice(prefix.length));
    },
    async read(relPath: string): Promise<string | null> {
      const bufferResult = await dustFs.readBuffer(`${root}/${relPath}`);
      if (bufferResult.isErr()) {
        logger.warn(
          { err: bufferResult.error, root, relPath },
          "buildFrameBundle: failed to read frame source"
        );

        return null;
      }

      return bufferResult.value ? bufferResult.value.toString("utf8") : null;
    },
  };
}
