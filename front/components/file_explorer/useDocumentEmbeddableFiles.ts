import type {
  DocumentEmbeddableFile,
  DocumentEmbeddableFiles,
} from "@app/components/editor/document";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import { compareStrings } from "@app/lib/i18n/format";
import { usePodFiles } from "@app/lib/swr/pods";
import type { FileSystemEntry } from "@app/types/api/file_system/types";
import {
  isFrameContentType,
  isSupportedImageContentType,
  stripMimeParameters,
} from "@app/types/files";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo, useState } from "react";

/**
 * @cc [owner:tdraier,label:product] document-embeddable-files
 * The files a document offers to embed MUST be the Frames and images among `entries`, by the
 * content type of their linked file when they have one. A Frame MUST have a linked file, since
 * only those render. Each MUST keep its entry's path.
 */
export function getDocumentEmbeddableFiles(
  entries: FileSystemEntry[]
): DocumentEmbeddableFile[] {
  return entries
    .flatMap((entry): DocumentEmbeddableFile[] => {
      if (entry.isDirectory) {
        return [];
      }
      const contentType = stripMimeParameters(
        entry.fileResourceContentType ?? entry.contentType
      );
      if (isFrameContentType(contentType)) {
        return entry.fileId
          ? [{ kind: "frame", path: entry.path, name: entry.fileName }]
          : [];
      }
      return isSupportedImageContentType(contentType)
        ? [{ kind: "image", path: entry.path, name: entry.fileName }]
        : [];
    })
    .sort((a, b) => compareStrings(a.name, b.name, { sensitivity: "base" }));
}

/**
 * @cc [owner:tdraier,label:performance] document-embeddable-files-lazy
 * No file list MUST be requested before `load` is called. Once it is, only the pod's files MUST be
 * requested for a document in a pod, and only the conversation's for one in a conversation.
 */
export function useDocumentEmbeddableFiles({
  owner,
  documentPath,
}: {
  owner: LightWorkspaceType;
  documentPath: string;
}): DocumentEmbeddableFiles {
  const [requested, setRequested] = useState(false);
  const scope = parseCanonicalScopedPath(documentPath)?.scope;
  const podId = scope?.kind === "canonical-pod" ? scope.id : null;
  const conversationId =
    scope?.kind === "canonical-conversation" ? scope.id : null;
  const { files: podFiles, isPodFilesLoading } = usePodFiles({
    owner,
    podId,
    disabled: !requested || !podId,
  });
  const { sandboxFiles, isSandboxFilesLoading } = useConversationSandboxFiles({
    owner,
    conversationId,
    options: { disabled: !requested || !conversationId },
  });
  const load = useCallback(() => setRequested(true), []);

  return useMemo(
    () => ({
      files: getDocumentEmbeddableFiles(podId ? podFiles : sandboxFiles),
      isLoading: podId ? isPodFilesLoading : isSandboxFilesLoading,
      load,
    }),
    [
      podId,
      podFiles,
      sandboxFiles,
      isPodFilesLoading,
      isSandboxFilesLoading,
      load,
    ]
  );
}
