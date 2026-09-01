import path from "node:path";

import { DustFileSystem, parseScopedPrefix } from "@app/lib/api/file_system";
import type { GCSMountPoint } from "@app/lib/api/files/gcs_mount/files";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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
  error: unknown
): error is FrameSourceMoveError {
  return error instanceof FrameSourceMoveError;
}

export function frameSourceMoveError(
  code: FrameSourceMoveError["code"],
  message: string
) {
  return new Err(new FrameSourceMoveError(code, message));
}

function pathError(message: string) {
  return frameSourceMoveError("invalid_source", message);
}

type FrameSourceOwner = {
  useCase: FileUseCase;
  useCaseMetadata: Pick<FileUseCaseMetadata, "conversationId" | "spaceId">;
};

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

function sourceOwnerFromPath(scopedPath: string): FrameSourceOwner | null {
  const parsed = parseScopedPrefix(scopedPath);
  const slash = scopedPath.indexOf("/");
  if (!parsed || slash < 0 || slash === scopedPath.length - 1) {
    return null;
  }

  switch (parsed.kind) {
    case "conversation":
      return {
        useCase: "conversation",
        useCaseMetadata: { conversationId: parsed.id },
      };
    case "pod":
      return {
        useCase: "project_context",
        useCaseMetadata: { spaceId: parsed.id },
      };
    case "user":
      return null;
  }
}

function isSameOwner(a: FrameSourceOwner, b: FrameSourceOwner): boolean {
  return (
    a.useCase === b.useCase &&
    a.useCaseMetadata.conversationId === b.useCaseMetadata.conversationId &&
    a.useCaseMetadata.spaceId === b.useCaseMetadata.spaceId
  );
}

export function resolveFrameSourceMovePaths({
  destinationDirectoryPath,
  sourceDirectoryPath,
}: {
  destinationDirectoryPath: string;
  sourceDirectoryPath: string;
}): Result<FrameSourceMovePaths, FrameSourceMoveError> {
  const source = DustFileSystem.normalizeScopedPath(sourceDirectoryPath);
  const destination = DustFileSystem.normalizeScopedPath(
    destinationDirectoryPath
  );
  if (!source || !destination) {
    return pathError("Frame source and destination must be scoped paths.");
  }
  if (source === destination || destination.startsWith(`${source}/`)) {
    return pathError(
      "Frame source and destination must be different, non-nested folders."
    );
  }

  const sourceOwner = sourceOwnerFromPath(source);
  const destinationOwner = sourceOwnerFromPath(destination);
  if (
    !sourceOwner ||
    !destinationOwner ||
    !isSameOwner(sourceOwner, destinationOwner)
  ) {
    return pathError(
      "Frame source and destination must use the same conversation or Pod mount."
    );
  }

  const destinationScope: GCSMountPoint =
    destinationOwner.useCase === "conversation"
      ? {
          useCase: "conversation",
          conversationId: destinationOwner.useCaseMetadata.conversationId ?? "",
        }
      : {
          useCase: "pod",
          podId: destinationOwner.useCaseMetadata.spaceId ?? "",
        };
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
