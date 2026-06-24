import { matchesSlashCommandCapabilityQuery } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { InlineSlashSearch } from "@app/components/editor/extensions/shared/slash_suggestion/InlineSlashSearch";
import { getSingularFileCategoryLabelForContentType } from "@app/components/file_explorer/utils";
import { useConversationAttachments } from "@app/hooks/conversations/useConversationAttachments";
import { isFileAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { usePodFiles } from "@app/lib/swr/pods";
import type { ProjectFileSearchResult } from "@app/lib/swr/search";
import { useSpaces } from "@app/lib/swr/spaces";
import type { FileAttachmentType } from "@app/types/api/assistant/conversation/attachments";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { DropdownMenuItem, Icon, Spinner } from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function toSelection(
  item: ContextFileSlashSearchItem
): ContextFileSlashSearchSelection {
  return {
    contentType: item.file.contentType,
    fileId: item.fileId,
    label: item.label,
    path: item.path,
  };
}

export interface ContextFileSlashSearchProps {
  conversationId: string | null;
  onCancel: () => void;
  onFileSelect: (selection: ContextFileSlashSearchSelection) => void;
  owner: LightWorkspaceType;
  spaceId?: string | null;
}

export function ContextFileSlashSearch({
  conversationId,
  onCancel,
  onFileSelect,
  owner,
  spaceId,
}: ContextFileSlashSearchProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global", "regular", "project"],
    disabled: false,
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
    disabled: !projectId,
  });

  const { attachments, isConversationAttachmentsLoading } =
    useConversationAttachments({
      conversationId,
      owner,
      options: { disabled: !conversationId },
    });

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const fileItems = useMemo<ContextFileSlashSearchItem[]>(() => {
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
  }, [attachments, normalizedQuery, podFiles, projectName]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fileItems.length and normalizedQuery are intentional triggers
  useEffect(() => {
    setSelectedIndex(0);
  }, [fileItems.length, normalizedQuery]);

  const handleItemSelect = useCallback(
    (index: number) => {
      const item = fileItems[index];
      if (!item) {
        return;
      }

      onFileSelect(toSelection(item));
      setSelectedIndex(0);
      setSearchQuery("");
    },
    [fileItems, onFileSelect]
  );

  const isLoading =
    isSpacesLoading ||
    (Boolean(conversationId) && isConversationAttachmentsLoading) ||
    (Boolean(projectId) && isPodFilesLoading);

  const dropdownContent =
    isLoading && fileItems.length === 0 ? (
      <div className="flex h-14 items-center justify-center">
        <Spinner size="sm" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-500-night">
          Loading files...
        </span>
      </div>
    ) : fileItems.length === 0 ? (
      <div className="flex h-14 items-center justify-center text-center text-sm text-gray-500 dark:text-gray-500-night">
        No files found
      </div>
    ) : (
      fileItems.map((item, index) => (
        <DropdownMenuItem
          key={item.id}
          itemId={item.id}
          icon={
            <Icon
              visual={getFileTypeIcon(item.file.contentType, item.label)}
              size="md"
            />
          }
          label={item.label}
          description={item.description}
          truncateText
          onClick={() => {
            handleItemSelect(index);
          }}
          onMouseEnter={() => setSelectedIndex(index)}
          className={
            index === selectedIndex ? "bg-gray-100 dark:bg-gray-800" : ""
          }
        />
      ))
    );

  return (
    <InlineSlashSearch
      deferDropdownUntilFocus
      dropdownContent={dropdownContent}
      highlightedItemId={fileItems[selectedIndex]?.id}
      isDropdownOpen={fileItems.length > 0 || isLoading}
      itemCount={fileItems.length}
      onCancel={onCancel}
      onSearchQueryChange={(text) => {
        setSearchQuery(text);
        setSelectedIndex(0);
      }}
      onSelectIndex={handleItemSelect}
      onSelectedIndexChange={setSelectedIndex}
      placeholder="Search conversation and pod files..."
      searchQuery={searchQuery}
      selectedIndex={selectedIndex}
    />
  );
}
