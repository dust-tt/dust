import { parseCanonicalScopedPath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import {
  FileResource,
  type ShareFileResponseBody,
} from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AuthorizedFileAccessModel } from "@app/lib/resources/storage/models/files";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import {
  type AuthorizedFileRef,
  contentTypeFromFileName,
  entryToAuthorizedFileRef,
  getAuthorizedFileRefLabel,
} from "@app/types/files";
import path from "path";

export type ShareFrameViewerFileSourceKind =
  | "conversation"
  | "pod"
  | "workspace";

export type ShareFrameViewerFile = {
  name: string;
  contentType: string;
  sourceKind: ShareFrameViewerFileSourceKind;
  sourceName: string;
  pathInSource?: string;
};

type ViewerFileSource =
  | { kind: "workspace" }
  | { kind: "conversation"; sId: string }
  | { kind: "pod"; sId: string };

function viewerFileSourceFromCanonicalPath(
  canonicalPath: string
): ViewerFileSource {
  const parsed = parseCanonicalScopedPath(canonicalPath);
  if (!parsed) {
    return { kind: "workspace" };
  }

  return parsed.scope.kind === "canonical-conversation"
    ? { kind: "conversation", sId: parsed.scope.id }
    : { kind: "pod", sId: parsed.scope.id };
}

function viewerFileSourceFromFile(
  file: FileResource | undefined
): ViewerFileSource {
  const metadata = file?.useCaseMetadata;
  if (!metadata) {
    return { kind: "workspace" };
  }

  if (metadata.spaceId) {
    return { kind: "pod", sId: metadata.spaceId };
  }

  const conversationId =
    metadata.conversationId ?? metadata.sourceConversationId ?? null;
  if (conversationId) {
    return { kind: "conversation", sId: conversationId };
  }

  return { kind: "workspace" };
}

function viewerFileSource(
  ref: AuthorizedFileRef,
  fileBySId: Map<string, FileResource>
): ViewerFileSource {
  if (ref.kind === "canonical_path") {
    return viewerFileSourceFromCanonicalPath(ref.ref);
  }

  return viewerFileSourceFromFile(fileBySId.get(ref.ref));
}

function pathInSourceFromCanonicalRef(
  canonicalPath: string
): string | undefined {
  const parsed = parseCanonicalScopedPath(canonicalPath);
  if (!parsed?.relPath) {
    return undefined;
  }

  const dir = path.posix.dirname(parsed.relPath);
  return dir === "." ? undefined : dir;
}

function viewerFileSourceName(
  source: ViewerFileSource,
  conversationTitleBySId: Map<string, string>,
  podNameBySId: Map<string, string>
): string {
  switch (source.kind) {
    case "workspace":
      return "Workspace";
    case "conversation":
      return conversationTitleBySId.get(source.sId) ?? "Deleted conversation";
    case "pod":
      return podNameBySId.get(source.sId) ?? "Deleted pod";
  }
}

function toShareFrameViewerFile(
  ref: AuthorizedFileRef,
  source: ViewerFileSource,
  file: FileResource | undefined,
  conversationTitleBySId: Map<string, string>,
  podNameBySId: Map<string, string>
): ShareFrameViewerFile {
  const name = getAuthorizedFileRefLabel(ref);
  const pathInSource =
    ref.kind === "canonical_path"
      ? pathInSourceFromCanonicalRef(ref.ref)
      : undefined;

  return {
    name,
    contentType:
      file?.contentType ??
      contentTypeFromFileName(name) ??
      "application/octet-stream",
    sourceKind: source.kind,
    sourceName: viewerFileSourceName(
      source,
      conversationTitleBySId,
      podNameBySId
    ),
    ...(pathInSource ? { pathInSource } : {}),
  };
}

export async function getShareFrameViewerFilesForFrame(
  auth: Authenticator,
  frameFile: FileResource
): Promise<ShareFrameViewerFile[]> {
  const shareableFile = await FileResource.shareableFileModel.findOne({
    where: { fileId: frameFile.id, workspaceId: frameFile.workspaceId },
  });
  if (!shareableFile) {
    return [];
  }

  const activeEntries = await AuthorizedFileAccessModel.findAll({
    where: {
      shareableFileId: shareableFile.id,
      workspaceId: frameFile.workspaceId,
      revokedAt: null,
    },
  });

  const refs = activeEntries.flatMap((entry) => {
    const ref = entryToAuthorizedFileRef({
      kind: entry.kind,
      ref: entry.ref,
      shareScope: entry.shareScope,
      computedByUserId: entry.computedByUserId,
      frameContentHash: entry.frameContentHash,
      allowedAt: entry.allowedAt.toISOString(),
      ...(entry.fileName ? { fileName: entry.fileName } : {}),
      ...(entry.legacyPath ? { legacyPath: entry.legacyPath } : {}),
    });
    return ref ? [ref] : [];
  });

  return getShareFrameViewerFiles(auth, refs);
}

export async function getShareFrameViewerFiles(
  auth: Authenticator,
  refs: AuthorizedFileRef[]
): Promise<ShareFrameViewerFile[]> {
  if (refs.length === 0) {
    return [];
  }

  const fileIds = refs
    .filter((ref) => ref.kind === "file_id")
    .map((ref) => ref.ref);
  const files =
    fileIds.length > 0 ? await FileResource.fetchByIds(auth, fileIds) : [];
  const fileBySId = new Map(files.map((file) => [file.sId, file]));

  const sources = refs.map((ref) => viewerFileSource(ref, fileBySId));

  const conversationSIds = [
    ...new Set(
      sources
        .filter((source) => source.kind === "conversation")
        .map((source) => source.sId)
    ),
  ];
  const podSIds = [
    ...new Set(
      sources
        .filter((source) => source.kind === "pod")
        .map((source) => source.sId)
    ),
  ];

  const [conversations, pods] = await Promise.all([
    conversationSIds.length > 0
      ? ConversationResource.fetchByIds(auth, conversationSIds)
      : [],
    podSIds.length > 0 ? SpaceResource.fetchByIds(auth, podSIds) : [],
  ]);

  const conversationTitleBySId = new Map(
    conversations.map((conversation) => [
      conversation.sId,
      getConversationDisplayTitle(conversation.toJSON()),
    ])
  );
  const podNameBySId = new Map(pods.map((pod) => [pod.sId, pod.name]));

  return refs.map((ref, index) =>
    toShareFrameViewerFile(
      ref,
      sources[index]!,
      ref.kind === "file_id" ? fileBySId.get(ref.ref) : undefined,
      conversationTitleBySId,
      podNameBySId
    )
  );
}

export async function buildShareFileResponse(
  auth: Authenticator,
  file: FileResource
): Promise<ShareFileResponseBody | null> {
  const shareInfo = await file.getShareInfo();
  if (!shareInfo) {
    return null;
  }

  const viewerFiles = await getShareFrameViewerFilesForFrame(auth, file);

  return {
    ...shareInfo,
    viewerFiles,
  };
}
