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

type EditFrameTextErrorCode =
  | "not_published"
  | "invalid_source"
  | "source_not_found"
  | "read_failed"
  | "edit_failed"
  | "write_failed"
  | "publish_failed"
  | "internal";

class EditFrameTextError extends Error {
  constructor(
    readonly code: EditFrameTextErrorCode,
    message: string
  ) {
    super(message);
    this.name = "EditFrameTextError";
  }
}

export type FrameTextEdit = {
  source: string;
  oldText: string;
  newText: string;
};

/**
 * Apply one or more human live edits to a published Frame by source location, then rebuild once.
 *
 * Each edit is a diff (`oldText` → `newText`) at `source` (`<relPath>:<line>:<col>`). Edits are
 * matched against the **current** source bytes (oldText primary, location as tiebreaker), so they
 * remain compatible with intervening agent edits that do not remove or rewrite the same span.
 * Same-file edits are applied in memory, written once, then a single {@link publishFrame} runs.
 */
export async function editFrameTextsAtSource(
  auth: Authenticator,
  {
    file,
    edits,
    editedByAgentConfigurationId,
  }: {
    file: FileResource;
    edits: FrameTextEdit[];
    editedByAgentConfigurationId?: string;
  }
): Promise<Result<{ warnings: ValidationWarning[] }, EditFrameTextError>> {
  if (edits.length === 0) {
    return new Err(
      new EditFrameTextError("invalid_source", "No edits provided.")
    );
  }

  const root = file.useCaseMetadata?.frameBundleRootPath;
  if (!file.isInteractiveContent || !root) {
    return new Err(
      new EditFrameTextError(
        "not_published",
        `Frame '${file.sId}' has no published bundle to edit by location.`
      )
    );
  }

  try {
    const rootScopedPath = root.replace(/\/+$/, "");

    // Group edits by source file so each file is read/written once. Validate locations before
    // touching the mount so malformed sources stay `invalid_source` (not an FS error).
    const editsByPath = new Map<
      string,
      Array<{ line: number; col: number; oldText: string; newText: string }>
    >();
    for (const edit of edits) {
      const location = parseSourceLocation(edit.source);
      if (!location) {
        return new Err(
          new EditFrameTextError(
            "invalid_source",
            `Invalid source location: ${edit.source}.`
          )
        );
      }
      const scopedPath = `${rootScopedPath}/${location.relPath}`;
      const list = editsByPath.get(scopedPath) ?? [];
      list.push({
        line: location.line,
        col: location.col,
        oldText: edit.oldText,
        newText: edit.newText,
      });
      editsByPath.set(scopedPath, list);
    }

    const fsResult = await DustFileSystem.fromScopedPath(auth, rootScopedPath);
    if (fsResult.isErr()) {
      return new Err(
        new EditFrameTextError("internal", fsResult.error.message)
      );
    }
    const dustFs = fsResult.value;

    for (const [scopedPath, fileEdits] of editsByPath) {
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

      let content = bufferResult.value.toString("utf8");
      for (const fileEdit of fileEdits) {
        const edited = replaceJsxTextAtSourceLocation(content, fileEdit);
        if (edited.isErr()) {
          return new Err(
            new EditFrameTextError("edit_failed", edited.error.message)
          );
        }
        content = edited.value;
      }

      const stat = await dustFs.stat(scopedPath);
      const contentType =
        stat.isOk() && stat.value ? stat.value.contentType : file.contentType;

      const writeResult = await dustFs.write(scopedPath, content, contentType);
      if (writeResult.isErr()) {
        return new Err(
          new EditFrameTextError("write_failed", writeResult.error.message)
        );
      }
    }

    const entryRelPath =
      file.useCaseMetadata?.frameEntryRelPath ?? file.fileName;

    const publishResult = await publishFrame(auth, {
      file,
      reader: createMountFrameSourceReader(dustFs, rootScopedPath),
      entryRelPath,
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

/**
 * Apply a single live edit and republish. Prefer {@link editFrameTextsAtSource} when flushing
 * multiple staged edits so the Frame is only rebuilt once.
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
  return editFrameTextsAtSource(auth, {
    file,
    edits: [{ source, oldText, newText }],
    editedByAgentConfigurationId,
  });
}
