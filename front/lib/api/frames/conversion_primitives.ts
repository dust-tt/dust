import { parseScopedPrefix } from "@app/lib/api/file_system";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";

export type FrameSourceOwner = {
  key: string;
  useCase: FileUseCase;
  useCaseMetadata: Pick<FileUseCaseMetadata, "conversationId" | "spaceId">;
};

export function getFrameSourceOwner(
  scopedPath: string
): FrameSourceOwner | null {
  const parsed = parseScopedPrefix(scopedPath);
  if (!parsed) {
    return null;
  }

  switch (parsed.kind) {
    case "conversation":
      return {
        key: `${parsed.kind}:${parsed.id}`,
        useCase: "conversation",
        useCaseMetadata: { conversationId: parsed.id },
      };
    case "pod":
      return {
        key: `${parsed.kind}:${parsed.id}`,
        useCase: "project_context",
        useCaseMetadata: { spaceId: parsed.id },
      };
    case "user":
      return null;
  }
}

export function getConvertedFrameMetadata(
  metadata: FileUseCaseMetadata | undefined,
  owner: FrameSourceOwner
): FileUseCaseMetadata {
  const {
    activePublicationId: _activePublicationId,
    conversationId: _conversationId,
    frameBundleRootPath: _frameBundleRootPath,
    frameEntryRelPath: _frameEntryRelPath,
    spaceId: _spaceId,
    ...stableMetadata
  } = metadata ?? {};

  return { ...stableMetadata, ...owner.useCaseMetadata };
}
