import type { DocumentEmbeddableFile } from "@app/components/editor/document";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import { compareStrings } from "@app/lib/i18n/format";
import { usePodFiles } from "@app/lib/swr/pods";
import type { FileSystemEntry } from "@app/types/api/file_system/types";
import {
  isSupportedImageContentType,
  stripMimeParameters,
} from "@app/types/files";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

/**
 * @cc [owner:tdraier,label:product] document-embeddable-files
 * The files a document offers to embed MUST be the images among `entries`, by the content type
 * of their linked file when they have one. Each MUST keep its entry's path.
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
      return isSupportedImageContentType(contentType)
        ? [{ kind: "image", path: entry.path, name: entry.fileName }]
        : [];
    })
    .sort((a, b) => compareStrings(a.name, b.name, { sensitivity: "base" }));
}

/** The images of the conversation or pod holding the document at `documentPath`. */
export function useDocumentEmbeddableFiles({
  owner,
  documentPath,
}: {
  owner: LightWorkspaceType;
  documentPath: string;
}): DocumentEmbeddableFile[] {
  const scope = parseCanonicalScopedPath(documentPath)?.scope;
  const podId = scope?.kind === "canonical-pod" ? scope.id : null;
  const conversationId =
    scope?.kind === "canonical-conversation" ? scope.id : null;
  const { files: podFiles } = usePodFiles({ owner, podId });
  const { sandboxFiles } = useConversationSandboxFiles({
    owner,
    conversationId,
  });

  return useMemo(
    () => getDocumentEmbeddableFiles(podId ? podFiles : sandboxFiles),
    [podId, podFiles, sandboxFiles]
  );
}
