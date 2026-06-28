import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import {
  validateTailwindCode,
  validateTypeScriptSyntax,
} from "@app/lib/api/files/content_validation";
import { ensureAuthorizedFileAccessForShare } from "@app/lib/api/viz/authorized_file_access";
import type { FrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import { buildFrameBundle } from "@app/lib/api/viz/build_frame_bundle";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import type { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type PublishFrameErrorCode =
  | "not_interactive_content"
  | "entry_not_found"
  | "invalid_syntax"
  | "build_failed"
  | "allowlist_failed"
  | "internal";

export class PublishFrameError extends Error {
  constructor(
    readonly code: PublishFrameErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PublishFrameError";
  }
}

const READ_CONCURRENCY = 16;

// Only code files are syntax/Tailwind validated; assets (.json, .css, images) are skipped.
const VALIDATED_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

function shouldValidate(relPath: string): boolean {
  return VALIDATED_EXTENSIONS.some((ext) => relPath.endsWith(ext));
}

/**
 * Publish a Frame: build its source tree into a single bundle and make it the rendered version.
 *
 * Steps, under the per-file edit lock:
 * 1. Read the frame's source tree once from `reader` (the mount).
 * 2. Validate every source file. TS/JSX syntax errors are blocking, so we only ever build valid
 *    TSX; Tailwind arbitrary-value warnings are non-blocking and returned to the caller.
 * 3. Bundle the (already-read) sources via {@link buildFrameBundle}.
 * 4. Store the bundle as the processed (rendered) version and record the root in metadata, which
 *    flips {@link FileResource.getRenderableVersion} to "processed".
 * 5. Recompute the authorized-file allowlist against the rendered bundle.
 *
 * `reader` is injected (rather than a `DustFileSystem`) so this stays unit-testable with an
 * in-memory tree; the handler wires `createMountFrameSourceReader`.
 */
export async function publishFrame(
  auth: Authenticator,
  {
    file,
    reader,
    rootScopedPath,
    publishedByAgentConfigurationId,
  }: {
    file: FileResource;
    reader: FrameSourceReader;
    rootScopedPath: string;
    publishedByAgentConfigurationId?: string;
  }
): Promise<Result<{ warnings: ValidationWarning[] }, PublishFrameError>> {
  if (!file.isInteractiveContent) {
    return new Err(
      new PublishFrameError(
        "not_interactive_content",
        `File '${file.sId}' is not an interactive content file.`
      )
    );
  }

  try {
    return await executeWithLock(`file:edit:${file.sId}`, async () => {
      // 1. Read the source tree once.
      const paths = await reader.list();
      const entries = await concurrentExecutor(
        paths,
        async (relPath) => ({ relPath, content: await reader.read(relPath) }),
        { concurrency: READ_CONCURRENCY }
      );

      const sources = new Map<string, string>();
      for (const { relPath, content } of entries) {
        if (content !== null) {
          sources.set(relPath, content);
        }
      }

      if (!sources.has(file.fileName)) {
        return new Err(
          new PublishFrameError(
            "entry_not_found",
            `Entry file '${file.fileName}' not found under '${rootScopedPath}'.`
          )
        );
      }

      // 2. Validate: syntax blocking, Tailwind warnings non-blocking.
      const warnings: ValidationWarning[] = [];
      const syntaxErrors: string[] = [];
      for (const [relPath, content] of sources) {
        if (!shouldValidate(relPath)) {
          continue;
        }
        const syntax = validateTypeScriptSyntax(content);
        if (syntax.isErr()) {
          syntaxErrors.push(`${relPath}:\n${syntax.error.message}`);
        }
        const tailwind = validateTailwindCode(content);
        if (tailwind.isErr()) {
          warnings.push(...tailwind.error);
        }
      }

      if (syntaxErrors.length > 0) {
        return new Err(
          new PublishFrameError("invalid_syntax", syntaxErrors.join("\n\n"))
        );
      }

      // 3. Bundle from the already-read sources (no second mount round trip).
      const inMemoryReader: FrameSourceReader = {
        list: async () => [...sources.keys()],
        read: async (relPath) => sources.get(relPath) ?? null,
      };
      const buildResult = await buildFrameBundle({
        entryRelPath: file.fileName,
        reader: inMemoryReader,
      });
      if (buildResult.isErr()) {
        return new Err(
          new PublishFrameError("build_failed", buildResult.error.message)
        );
      }

      // 4. Refresh the canonical source from the entry so MCP retrieve and the render fallback
      //    stay in sync with what was published (the entry is guaranteed present, checked above).
      const entrySource = sources.get(file.fileName);
      if (entrySource !== undefined) {
        await file.uploadContent(auth, entrySource);
      }

      // 5. Store the bundle as the rendered version and mark the frame published.
      await file.uploadProcessedFrameBundle(auth, buildResult.value.code);
      await file.setUseCaseMetadata(auth, {
        ...(file.useCaseMetadata ?? {}),
        frameBundleRootPath: rootScopedPath,
        ...(publishedByAgentConfigurationId
          ? {
              lastEditedByAgentConfigurationId: publishedByAgentConfigurationId,
            }
          : {}),
      });

      // 6. Recompute the allowlist against the rendered bundle.
      const allowlist = await ensureAuthorizedFileAccessForShare(auth, file);
      if (allowlist.isErr()) {
        return new Err(
          new PublishFrameError("allowlist_failed", allowlist.error.message)
        );
      }

      return new Ok({ warnings });
    });
  } catch (err) {
    return new Err(
      new PublishFrameError("internal", normalizeError(err).message)
    );
  }
}
