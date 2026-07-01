import { DustFileSystem } from "@app/lib/api/file_system";
import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import { createMountFrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import {
  parseSourceLocation,
  replaceJsxTextAtSourceLocation,
} from "@app/lib/api/viz/edit_source_text";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type EditFrameTextErrorCode =
  | "not_published"
  | "invalid_source"
  | "source_not_found"
  | "read_failed"
  | "edit_failed"
  | "write_failed"
  | "publish_failed"
  | "internal";

export class EditFrameTextError extends Error {
  constructor(
    readonly code: EditFrameTextErrorCode,
    message: string
  ) {
    super(message);
    this.name = "EditFrameTextError";
  }
}

/**
 * Apply a human "live edit" to a published Frame by source location.
 *
 * The viz runtime hands us the clicked element's `data-source` (`<relPath>:<line>:<col>`, baked
 * into the bundle by the publisher) plus the old/new visible text. We route the edit back to the
 * SOURCE file in the mount, then rebuild the Frame so the rendered bundle reflects the change.
 *
 * Steps:
 * 1. Resolve the Frame's build root from `frameBundleRootPath` (only published Frames have one and
 *    thus carry `data-source` tags).
 * 2. Read the addressed source file from the mount and splice the new text by AST location.
 * 3. Write the updated source back to the mount (the durable source of truth).
 * 4. Rebuild via {@link publishFrame}, which re-reads the import graph, re-bundles, refreshes the
 *    rendered version, and recomputes the share allowlist. A text-only edit changes neither
 *    imports nor data refs, but rebuilding keeps the bundle and the source in lock-step.
 *
 * Note: the mount read/modify/write is not held under the publish lock (that lock is taken by
 * {@link publishFrame} and is not reentrant). Live edits are human-paced, so a concurrent edit to
 * the same file could lose an update, which is acceptable for now.
 */
export async function editFrameTextAtSource(
  auth: Authenticator,
  {
    file,
    source,
    oldText,
    newText,
    editedByAgentConfigurationId,
  }: {
    file: FileResource;
    source: string;
    oldText: string;
    newText: string;
    editedByAgentConfigurationId?: string;
  }
): Promise<Result<{ warnings: ValidationWarning[] }, EditFrameTextError>> {
  const root = file.useCaseMetadata?.frameBundleRootPath;
  if (!file.isInteractiveContent || !root) {
    return new Err(
      new EditFrameTextError(
        "not_published",
        `Frame '${file.sId}' has no published bundle to edit by location.`
      )
    );
  }

  const location = parseSourceLocation(source);
  if (!location) {
    return new Err(
      new EditFrameTextError(
        "invalid_source",
        `Invalid source location: ${source}.`
      )
    );
  }

  try {
    const rootScopedPath = root.replace(/\/+$/, "");
    const scopedPath = `${rootScopedPath}/${location.relPath}`;

    const fsResult = await DustFileSystem.fromScopedPath(auth, rootScopedPath);
    if (fsResult.isErr()) {
      return new Err(
        new EditFrameTextError("internal", fsResult.error.message)
      );
    }
    const dustFs = fsResult.value;

    const bufferResult = await dustFs.readBuffer(scopedPath);
    if (bufferResult.isErr()) {
      return new Err(
        new EditFrameTextError("read_failed", bufferResult.error.message)
      );
    }
    if (bufferResult.value === null) {
      return new Err(
        new EditFrameTextError(
          "source_not_found",
          `Source file not found: ${scopedPath}.`
        )
      );
    }
    const content = bufferResult.value.toString("utf8");

    const edited = replaceJsxTextAtSourceLocation(content, {
      line: location.line,
      col: location.col,
      oldText,
      newText,
    });
    if (edited.isErr()) {
      return new Err(
        new EditFrameTextError("edit_failed", edited.error.message)
      );
    }

    // Preserve the source file's existing content type when writing it back.
    const stat = await dustFs.stat(scopedPath);
    const contentType =
      stat.isOk() && stat.value ? stat.value.contentType : file.contentType;

    const writeResult = await dustFs.write(
      scopedPath,
      edited.value,
      contentType
    );
    if (writeResult.isErr()) {
      return new Err(
        new EditFrameTextError("write_failed", writeResult.error.message)
      );
    }

    const publishResult = await publishFrame(auth, {
      file,
      reader: createMountFrameSourceReader(dustFs, rootScopedPath),
      rootScopedPath,
      publishedByAgentConfigurationId: editedByAgentConfigurationId,
    });
    if (publishResult.isErr()) {
      return new Err(
        new EditFrameTextError("publish_failed", publishResult.error.message)
      );
    }

    return new Ok({ warnings: publishResult.value.warnings });
  } catch (err) {
    return new Err(
      new EditFrameTextError("internal", normalizeError(err).message)
    );
  }
}
