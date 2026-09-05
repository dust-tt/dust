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

export function isFrameSourceMoveError(
  err: unknown
): err is FrameSourceMoveError {
  return err instanceof FrameSourceMoveError;
}

export type FrameSourceMovePaths = {
  auditEvent: {
    parentRelativePath: string;
    relativeFilePath: string;
  };
  destinationDirectoryPath: string;
  destinationManifestPath: string;
  destinationScope: GCSMountPoint;
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
    sourcePrefix.kind !== destinationPrefix.kind ||
    sourcePrefix.id !== destinationPrefix.id
  ) {
    return new Err(
      new FrameSourceMoveError(
        "invalid_source",
        "Frame source and destination must use the same conversation or Pod mount."
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
  const scopedPrefix = source.split("/", 1)[0];
  const parentRelativePath = path.posix.dirname(
    path.posix.relative(scopedPrefix, destination)
  );

  return new Ok({
    auditEvent: {
      parentRelativePath: parentRelativePath === "." ? "" : parentRelativePath,
      relativeFilePath: path.posix.relative(scopedPrefix, source),
    },
    destinationDirectoryPath: destination,
    destinationManifestPath: path.posix.join(destination, FRAME_MANIFEST_FILE),
    destinationScope,
    sourceDirectoryPath: source,
    sourceManifestPath: path.posix.join(source, FRAME_MANIFEST_FILE),
  });
}
