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
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type PublishFrameErrorCode =
  | "allowlist_failed"
  | "build_failed"
  | "entry_not_found"
  | "internal"
  | "invalid_syntax"
  | "not_interactive_content";

export class PublishFrameError extends Error {
  constructor(
    readonly code: PublishFrameErrorCode,
    message: string
  ) {
    super(message);

    this.name = "PublishFrameError";
  }
}

// Only code files are syntax and Tailwind validated. Assets (.json, .css, images) are skipped.
const VALIDATED_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

function shouldValidate(relPath: string): boolean {
  return VALIDATED_EXTENSIONS.some((ext) => relPath.endsWith(ext));
}

/**
 * Publish a Frame: build its source tree into a single bundle and make it the rendered version.
 *
 * Steps, under the per-file edit lock:
 * 1. Bundle from the entry via {@link buildFrameBundle}. Reads are driven by the import graph, so
 *    only files reachable from the entry are pulled from the mount. A validating wrapper checks
 *    each file as it loads: TS/JSX syntax errors are blocking, Tailwind warnings are not and are
 *    returned to the caller. Files in the mount that the frame does not import are never touched.
 * 2. Store the bundle as the processed (rendered) version and record the root in metadata, which
 *    flips {@link FileResource.getRenderableVersion} to "processed".
 * 3. Refresh the canonical source from the entry so MCP retrieve and the render fallback match.
 * 4. Recompute the authorized-file allowlist against the rendered bundle.
 *
 * `reader` is injected (rather than a `DustFileSystem`) so this stays unit-testable with an
 * in-memory tree. The handler wires `createMountFrameSourceReader`.
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
        `File '${file.sId}' is not interactive content.`
      )
    );
  }

  try {
    return await executeWithLock(`file:edit:${file.sId}`, async () => {
      // 1. Bundle from the entry. The bundler walks the import graph and reads each module
      //    lazily. This wrapper validates and caches every file as it is pulled, so only the
      //    frame's actual sources are read and checked, never unrelated files in the mount.
      const warnings: ValidationWarning[] = [];
      const syntaxErrors: string[] = [];
      const cache = new Map<string, string>();

      const validatingReader: FrameSourceReader = {
        list: () => reader.list(),
        read: async (relPath) => {
          const content = await reader.read(relPath);
          if (content === null) {
            return null;
          }

          cache.set(relPath, content);
          if (shouldValidate(relPath)) {
            const syntax = validateTypeScriptSyntax(content);
            if (syntax.isErr()) {
              syntaxErrors.push(`${relPath}:\n${syntax.error.message}`);
            }

            const tailwind = validateTailwindCode(content);
            if (tailwind.isErr()) {
              warnings.push(...tailwind.error);
            }
          }

          return content;
        },
      };

      const buildResult = await buildFrameBundle({
        entryRelPath: file.fileName,
        reader: validatingReader,
      });

      // Blocking syntax errors take precedence over the generic build failure so the caller
      // gets the per-file message rather than esbuild's.
      if (syntaxErrors.length > 0) {
        return new Err(
          new PublishFrameError("invalid_syntax", syntaxErrors.join("\n\n"))
        );
      }
      if (buildResult.isErr()) {
        switch (buildResult.error.code) {
          case "entry_not_found":
            return new Err(
              new PublishFrameError(
                "entry_not_found",
                buildResult.error.message
              )
            );

          case "read_failed":
            return new Err(
              new PublishFrameError("internal", buildResult.error.message)
            );

          case "build_failed":
            return new Err(
              new PublishFrameError("build_failed", buildResult.error.message)
            );

          default:
            assertNever(buildResult.error.code);
        }
      }

      // 2. Refresh the canonical source from the entry so MCP retrieve and the render fallback
      //    stay in sync with what was published (the entry is always read during the build).
      const entrySource = cache.get(file.fileName);
      if (entrySource !== undefined) {
        await file.uploadContent(auth, entrySource);
      }

      // 3. Store the bundle as the rendered version and mark the frame published.
      await file.uploadProcessed(auth, buildResult.value.code);
      // frameBundleRootPath flips rendering to the bundle, and live edits later reuse it to
      // relocate the source tree in the mount and rebuild without a model in the loop.
      await file.setUseCaseMetadata(auth, {
        ...(file.useCaseMetadata ?? {}),
        frameBundleRootPath: rootScopedPath,
        ...(publishedByAgentConfigurationId
          ? {
              lastEditedByAgentConfigurationId: publishedByAgentConfigurationId,
            }
          : {}),
      });

      // 4. Recompute the allowlist against the rendered bundle.
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
