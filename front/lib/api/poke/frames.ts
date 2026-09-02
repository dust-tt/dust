import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { FrameSandboxAdapter } from "@app/lib/resources/frame_sandbox_adapter";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { UserResource } from "@app/lib/resources/user_resource";
import type { FileStatus } from "@app/types/files";
import { removeNulls } from "@app/types/shared/utils/general";

export type PokeFrameListItem = {
  sId: string;
  fileName: string;
  status: FileStatus;
  mountFilePath: string | null;
  activePublicationId: string | null;
  conversationId: string | null;
  spaceId: string | null;
  functionCount: number;
  sandboxStatus: SandboxStatus | null;
  author: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PokeListFrames = {
  items: PokeFrameListItem[];
  hasMore: boolean;
  lastValue: string | null;
};

export async function listWorkspaceFrames(
  auth: Authenticator,
  pagination: {
    limit: number;
    lastValue?: string;
    orderDirection: "asc" | "desc";
  }
): Promise<PokeListFrames> {
  const { frames, hasMore, lastValue } =
    await FileResource.listFrameV2ForWorkspacePaginated(auth, pagination);

  if (frames.length === 0) {
    return { items: [], hasMore, lastValue };
  }

  const frameModelIds = frames.map((frame) => frame.id);

  const [functionCounts, sandboxStatuses, authors] = await Promise.all([
    SandboxFunctionResource.countByFrameModelIds(auth, frameModelIds),
    FrameSandboxAdapter.fetchSandboxStatusesByFrameModelIds(
      auth,
      frameModelIds
    ),
    UserResource.fetchByModelIds(
      removeNulls(frames.map((frame) => frame.userId))
    ),
  ]);

  const authorsByModelId = new Map(authors.map((user) => [user.id, user]));

  return {
    items: frames.map((frame) => {
      const author = frame.userId
        ? authorsByModelId.get(frame.userId)
        : undefined;

      return {
        sId: frame.sId,
        fileName: frame.fileName,
        status: frame.status,
        mountFilePath: frame.mountFilePath,
        activePublicationId: frame.useCaseMetadata?.activePublicationId ?? null,
        conversationId: frame.useCaseMetadata?.conversationId ?? null,
        spaceId: frame.useCaseMetadata?.spaceId ?? null,
        functionCount: functionCounts.get(frame.id) ?? 0,
        sandboxStatus: sandboxStatuses.get(frame.id) ?? null,
        author: author ? author.fullName() : null,
        createdAt: frame.createdAt.toISOString(),
        updatedAt: frame.updatedAt.toISOString(),
      };
    }),
    hasMore,
    lastValue,
  };
}
