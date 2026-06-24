import { matchesSlashCommandCapabilityQuery } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { getSingularFileCategoryLabelForContentType } from "@app/components/file_explorer/utils";
import { useConversationAttachments } from "@app/hooks/conversations/useConversationAttachments";
import { isFileAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { usePodFiles } from "@app/lib/swr/pods";
import type { ProjectFileSearchResult } from "@app/lib/swr/search";
import { useSpaces } from "@app/lib/swr/spaces";
import type { FileAttachmentType } from "@app/types/api/assistant/conversation/attachments";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

export type ContextFileSlashSearchSelection = {
  contentType: string;
  fileId: string;
  label: string;
  path: string;
};

export type ContextFileSlashSearchItem =
  | {
      description: string;
      file: FileAttachmentType;
      fileId: string;
      id: string;
      kind: "conversation";
      label: string;
      path: string;
    }
  | {
      description: string;
      file: ProjectFileSearchResult;
      fileId: string;
      id: string;
      kind: "pod";
      label: string;
      path: string;
    };

function sortContextFileItemsByLabel(
  items: ContextFileSlashSearchItem[]
): ContextFileSlashSearchItem[] {
  return items.toSorted((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
}

export function useContextFileSlashSearchItems({
  conversationId,
  includeFiles,
  normalizedQuery,
  owner,
  spaceId,
}: {
  conversationId: string | null;
  includeFiles: boolean;
  normalizedQuery: string;
  owner: LightWorkspaceType;
  spaceId?: string | null;
}) {
  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global", "regular", "project"],
    disabled: !includeFiles,
  });

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces.map((space) => [space.sId, space])),
    [spaces]
  );

  const projectId =
    spaceId && spacesMap[spaceId]?.kind === "project" ? spaceId : undefined;
  const projectName =
    projectId && spacesMap[projectId]?.name ? spacesMap[projectId].name : "";

  const { files: podFiles, isPodFilesLoading } = usePodFiles({
    owner,
    podId: projectId ?? "",
    disabled: !includeFiles || !projectId,
  });

  const { attachments, isConversationAttachmentsLoading } =
    useConversationAttachments({
      conversationId,
      owner,
      options: { disabled: !includeFiles || !conversationId },
    });

  const fileItems = useMemo<ContextFileSlashSearchItem[]>(() => {
    if (!includeFiles) {
      return [];
    }

    const matchesQuery = (label: string, description: string) =>
      matchesSlashCommandCapabilityQuery({
        description,
        label,
        query: normalizedQuery,
      });

    const conversationFiles = attachments
      .filter(isFileAttachmentType)
      .filter((attachment) => !attachment.hidden)
      .filter((attachment) => !attachment.isInProjectContext)
      .filter(
        (attachment): attachment is typeof attachment & { path: string } =>
          attachment.path !== null
      )
      .filter((attachment) =>
        matchesQuery(attachment.title, "Conversation file")
      )
      .map((attachment) => ({
        description: "Conversation file",
        file: attachment,
        fileId: attachment.fileId,
        id: `conversation-${attachment.fileId}`,
        kind: "conversation" as const,
        label: attachment.title,
        path: attachment.path,
      }));

    const podContextFiles = removeNulls(
      podFiles.map((file) => {
        if (file.isDirectory || file.fileId == null) {
          return null;
        }

        const podFile: ProjectFileSearchResult = {
          fileId: file.fileId,
          title: file.fileName,
          contentType: file.contentType,
        };

        const fileKind = getSingularFileCategoryLabelForContentType(
          podFile.contentType
        );
        const description = projectName
          ? `${fileKind} in "${projectName}" knowledge`
          : `${fileKind} in Pod knowledge`;

        if (!matchesQuery(podFile.title, description)) {
          return null;
        }

        return {
          description,
          file: podFile,
          fileId: podFile.fileId,
          id: `pod-${podFile.fileId}`,
          kind: "pod" as const,
          label: podFile.title,
          path: file.path,
        };
      })
    );

    return [
      ...sortContextFileItemsByLabel(conversationFiles),
      ...sortContextFileItemsByLabel(podContextFiles),
    ];
  }, [attachments, includeFiles, normalizedQuery, podFiles, projectName]);

  const isFileItemsLoading =
    includeFiles &&
    (isSpacesLoading ||
      (Boolean(conversationId) && isConversationAttachmentsLoading) ||
      (Boolean(projectId) && isPodFilesLoading));

  return {
    fileItems,
    isFileItemsLoading,
  };
}
