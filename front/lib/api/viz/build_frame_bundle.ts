import type {
  BundleError,
  BundleEsbuildOptions,
  SourceReader,
} from "@app/lib/api/bundler/bundle_module";
import { bundleModule } from "@app/lib/api/bundler/bundle_module";
import type { DustFileSystem } from "@app/lib/api/file_system";
import { injectSourceLocationTags } from "@app/lib/api/viz/source_location_tags";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";

// A frame's source tree reader, the generic engine reader under a frame-named alias.
export type FrameSourceReader = SourceReader;

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
 * Bundle a multi-file frame into a single self-contained module. Thin wrapper over
 * {@link bundleModule} supplying the viz esbuild options and the JSX source-location transform, so
 * live edits on the rendered bundle route back to the correct source file. All graph-walking lives
 * in the generic engine.
 */
export async function buildFrameBundle({
  entryRelPath,
  reader,
}: {
  entryRelPath: string;
  reader: FrameSourceReader;
}): Promise<Result<{ code: string }, BundleError>> {
  return bundleModule({
    entryRelPath,
    reader,
    esbuild: FRAME_ESBUILD_OPTIONS,
    // Stamp each source file with `data-source` tags before inlining so the rendered bundle keeps
    // the origin of every JSX element for live edits.
    transform: injectSourceLocationTags,
  });
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
