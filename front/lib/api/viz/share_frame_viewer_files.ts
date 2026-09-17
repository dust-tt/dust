import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ShareFileResponseBody } from "@app/lib/resources/file_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AuthorizedFileAccessModel } from "@app/lib/resources/storage/models/files";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import type { AuthorizedFileRef } from "@app/types/files";
import {
  contentTypeFromFileName,
  entryToAuthorizedFileRef,
  getAuthorizedFileRefLabel,
} from "@app/types/files";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import path from "path";

export type ShareFrameViewerFileSourceKind =
  | "conversation"
  | "pod"
  | "workspace";

export type ShareFrameViewerFile = {
  ref: string;
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
  fileById: Map<string, FileResource>
): ViewerFileSource {
  if (ref.kind === "canonical_path") {
    return viewerFileSourceFromCanonicalPath(ref.ref);
  }

  return viewerFileSourceFromFile(fileById.get(ref.ref));
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
  conversationTitleById: Map<string, string>,
  podNameById: Map<string, string>
): string {
  switch (source.kind) {
    case "workspace":
      return "Workspace";
    case "conversation":
      return conversationTitleById.get(source.sId) ?? "Deleted conversation";
    case "pod":
      return podNameById.get(source.sId) ?? "Deleted pod";
  }
}

function toShareFrameViewerFile(
  ref: AuthorizedFileRef,
  source: ViewerFileSource,
  file: FileResource | undefined,
  conversationTitleById: Map<string, string>,
  podNameById: Map<string, string>
): ShareFrameViewerFile {
  const name = getAuthorizedFileRefLabel(ref);
  const pathInSource =
    ref.kind === "canonical_path"
      ? pathInSourceFromCanonicalRef(ref.ref)
      : undefined;

  return {
    ref: ref.ref,
    name,
    contentType:
      file?.contentType ??
      contentTypeFromFileName(name) ??
      "application/octet-stream",
    sourceKind: source.kind,
    sourceName: viewerFileSourceName(
      source,
      conversationTitleById,
      podNameById
    ),
    ...(pathInSource ? { pathInSource } : {}),
  };
}

async function getShareFrameViewerFilesForFrame(
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
    },
  });

  const refs = activeEntries.flatMap((entry) => {
    const ref = entryToAuthorizedFileRef({
      kind: entry.kind,
      ref: entry.ref,
      shareScope: entry.shareScope,
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
  const fileById = new Map(files.map((file) => [file.sId, file]));

  const sources = refs.map((ref) => viewerFileSource(ref, fileById));

  const conversationIds = [
    ...new Set(
      sources
        .filter((source) => source.kind === "conversation")
        .map((source) => source.sId)
    ),
  ];
  const podIds = [
    ...new Set(
      sources
        .filter((source) => source.kind === "pod")
        .map((source) => source.sId)
    ),
  ];

  const [conversations, pods] = await Promise.all([
    conversationIds.length > 0
      ? ConversationResource.fetchByIds(auth, conversationIds)
      : [],
    podIds.length > 0 ? SpaceResource.fetchByIds(auth, podIds) : [],
  ]);

  const conversationTitleById = new Map(
    conversations.map((conversation) => [
      conversation.sId,
      getConversationDisplayTitle(conversation.toJSON()),
    ])
  );
  const podNameById = new Map(pods.map((pod) => [pod.sId, pod.name]));

  return refs.map((ref, index) =>
    toShareFrameViewerFile(
      ref,
      sources[index]!,
      ref.kind === "file_id" ? fileById.get(ref.ref) : undefined,
      conversationTitleById,
      podNameById
    )
  );
}

export async function buildShareFileResponse(
  auth: Authenticator,
  file: FileResource
): Promise<ShareFileResponseBody | null> {
  if (file.isFrameV2) {
    await file.ensureShareableFrame(auth);
  }

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
