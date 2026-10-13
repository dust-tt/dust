import path from "node:path";

import { DustFileSystem, parseScopedPrefix } from "@app/lib/api/file_system";
import type { GCSMountPoint } from "@app/lib/api/files/gcs_mount/files";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export class FrameSourceMoveError extends Error {
  constructor(
    readonly code:
      | "commit_failed"
      | "conflict"
      | "copy_failed"
      | "invalid_source",
    message: string
  ) {
    super(message);
    this.name = "FrameSourceMoveError";
  }
}

export const moveError = (
  code: FrameSourceMoveError["code"],
  message: string
) => new Err(new FrameSourceMoveError(code, message));

export type FrameSourceMovePaths = {
  auditEvent: {
    parentRelativePath: string;
    relativeFilePath: string;
  };
  destinationDirectoryPath: string;
  destinationManifestPath: string;
  destinationScope: GCSMountPoint;
  /** The Pod a conversation Frame is saved to, or null for a move within one mount. */
  savedToPodId: string | null;
  sourceDirectoryPath: string;
  sourceManifestPath: string;
};

function normalizeFrameDirectoryPath(scopedPath: string): string | null {
  const normalized = DustFileSystem.normalizeScopedPath(scopedPath);
  if (!normalized) {
    return null;
  }

  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

/**
 * @cc [owner:davidebbo,label:product;backend] frame-cross-mount-move-only-to-pod
 * A Frame move MUST stay within one conversation or Pod mount, except from a conversation mount
 * to a Pod mount, which MUST be reported through `savedToPodId`. Every other cross-mount move
 * (Pod to conversation, Pod to Pod, conversation to conversation) and any user mount MUST be
 * rejected with `invalid_source`.
 */
export function resolveFrameSourceMovePaths({
  destinationDirectoryPath,
  sourceDirectoryPath,
}: {
  destinationDirectoryPath: string;
  sourceDirectoryPath: string;
}): Result<FrameSourceMovePaths, FrameSourceMoveError> {
  const source = normalizeFrameDirectoryPath(sourceDirectoryPath);
  const destination = normalizeFrameDirectoryPath(destinationDirectoryPath);
  if (!source || !destination) {
    return new Err(
      new FrameSourceMoveError(
        "invalid_source",
        "Frame source and destination must be scoped paths."
      )
    );
  }
  if (source === destination || destination.startsWith(`${source}/`)) {
    return new Err(
      new FrameSourceMoveError(
        "invalid_source",
        "Frame source and destination must be different, non-nested folders."
      )
    );
  }

  const sourcePrefix = parseScopedPrefix(source);
  const destinationPrefix = parseScopedPrefix(destination);
  if (
    !source.includes("/") ||
    !destination.includes("/") ||
    !sourcePrefix ||
    !destinationPrefix ||
    sourcePrefix.kind === "user" ||
    destinationPrefix.kind === "user" ||
    sourcePrefix.kind === "conversation_metadata" ||
    destinationPrefix.kind === "conversation_metadata"
  ) {
    return new Err(
      new FrameSourceMoveError(
        "invalid_source",
        "Frame source and destination must use a conversation or Pod mount."
      )
    );
  }

  const isSameMount =
    sourcePrefix.kind === destinationPrefix.kind &&
    sourcePrefix.id === destinationPrefix.id;
  // Saving a conversation Frame to a Pod is the only cross-mount move: leaving a Pod would strand
  // the Pod references addressing the Frame.
  const isSaveToPod =
    sourcePrefix.kind === "conversation" && destinationPrefix.kind === "pod";
  if (!isSameMount && !isSaveToPod) {
    return new Err(
      new FrameSourceMoveError(
        "invalid_source",
        "Frame source and destination must use the same conversation or Pod mount, or move from a conversation to a Pod."
      )
    );
  }

  let destinationScope: GCSMountPoint;
  switch (destinationPrefix.kind) {
    case "conversation":
      destinationScope = {
        useCase: "conversation",
        conversationId: destinationPrefix.id,
      };
      break;
    case "pod":
      destinationScope = {
        useCase: "pod",
        podId: destinationPrefix.id,
      };
      break;
    default:
      assertNever(destinationPrefix);
  }
  const parentRelativePath = path.posix.dirname(
    path.posix.relative(destination.split("/", 1)[0], destination)
  );

  return new Ok({
    auditEvent: {
      parentRelativePath: parentRelativePath === "." ? "" : parentRelativePath,
      relativeFilePath: path.posix.relative(source.split("/", 1)[0], source),
    },
    destinationDirectoryPath: destination,
    destinationManifestPath: path.posix.join(destination, FRAME_MANIFEST_FILE),
    destinationScope,
    savedToPodId: isSaveToPod ? destinationPrefix.id : null,
    sourceDirectoryPath: source,
    sourceManifestPath: path.posix.join(source, FRAME_MANIFEST_FILE),
  });
}
