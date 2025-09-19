import {
  Button,
  CitationGrid,
  DocumentIcon,
  FolderIcon,
  FolderOpenIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  ScrollArea,
} from "@dust-tt/sparkle";
import React from "react";

import {
  AgentMessageContentCreationGeneratedFiles,
  DefaultAgentMessageGeneratedFiles,
} from "@app/components/assistant/conversation/AgentMessageGeneratedFiles";
import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import { useConversationFiles } from "@app/lib/swr/conversations";
import type {
  AllSupportedFileContentType,
  LightWorkspaceType,
} from "@app/types";
import { clientExecutableContentType } from "@app/types";

interface FileGroup {
  contentType: AllSupportedFileContentType | "other";
  files: ActionGeneratedFileType[];
  key: string;
  title: string;
}

// Configuration for content types that get their own groups.
const GROUPED_CONTENT_TYPES = {
  [clientExecutableContentType]: "Content Creation",
  "application/json": "JSON",
  "text/csv": "Tables",
  "text/plain": "Text",
  "text/markdown": "Markdown",
} as const satisfies Partial<Record<AllSupportedFileContentType, string>>;

type GroupedContentType = keyof typeof GROUPED_CONTENT_TYPES;

function hasOwnGroup(
  contentType: AllSupportedFileContentType
): contentType is GroupedContentType {
  return contentType in GROUPED_CONTENT_TYPES;
}

function groupFilesByContentType(
  files: ActionGeneratedFileType[]
): FileGroup[] {
  const groupMap = new Map<string, ActionGeneratedFileType[]>();

  for (const file of files) {
    const key = hasOwnGroup(file.contentType) ? file.contentType : "other";

    const existingFiles = groupMap.get(key) ?? [];
    groupMap.set(key, [...existingFiles, file]);
  }

  const groups: FileGroup[] = [];

  // Add grouped content types first (in order).
  for (const [contentType, displayName] of Object.entries(
    GROUPED_CONTENT_TYPES
  )) {
    const filesForType = groupMap.get(contentType);
    if (filesForType && filesForType.length > 0) {
      groups.push({
        key: contentType,
        title: displayName,
        contentType: contentType as GroupedContentType,
        files: filesForType,
      });
      groupMap.delete(contentType);
    }
  }

  // Add "Other" group last if there are remaining files.
  const otherFiles = groupMap.get("other");
  if (otherFiles && otherFiles.length > 0) {
    groups.push({
      key: "other",
      title: "Other",
      contentType: "other",
      files: otherFiles,
    });
  }

  return groups;
}

interface FileRendererProps {
  files: ActionGeneratedFileType[];
  owner: LightWorkspaceType;
}

function FileRenderer({ files, owner }: FileRendererProps) {
  return (
    <CitationGrid variant="grid" className="md:grid-cols-3">
      {files.map((file) => (
        <DefaultAgentMessageGeneratedFiles
          key={file.fileId}
          document={{
            href: `/api/w/${owner.sId}/files/${file.fileId}`,
            icon: <DocumentIcon />,
            title: file.title,
          }}
          index={-1}
        />
      ))}
    </CitationGrid>
  );
}

interface FileGroupSectionProps {
  group: FileGroup;
  onFileClick: () => void;
  owner: LightWorkspaceType;
}

function FileGroupSection({
  group,
  onFileClick,
  owner,
}: FileGroupSectionProps) {
  const isContentCreation = group.contentType === clientExecutableContentType;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-primary dark:text-primary-night">
        {group.title}
      </div>
      <div>
        {isContentCreation ? (
          <AgentMessageContentCreationGeneratedFiles
            files={group.files}
            variant="grid"
            onClick={onFileClick}
          />
        ) : (
          <FileRenderer files={group.files} owner={owner} />
        )}
      </div>
    </div>
  );
}

function EmptyFilesState() {
  return (
    <div className="flex flex-col gap-2 py-4 text-center">
      <div className="text-md font-semibold text-primary dark:text-primary-night">
        Nothing generated yet
      </div>
      <div className="text-sm text-muted-foreground">
        Files and Content Creations generated in this conversation will appear
        here.
      </div>
    </div>
  );
}

interface ConversationFilesPopoverProps {
  conversationId: string | null;
  owner: LightWorkspaceType;
}

export function ConversationFilesPopover({
  conversationId,
  owner,
}: ConversationFilesPopoverProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [shouldDisableConversationFiles, setShouldDisableConversationFiles] =
    React.useState(true);

  const { conversationFiles, isConversationFilesLoading } =
    useConversationFiles({
      conversationId,
      owner,
      options: {
        disabled: shouldDisableConversationFiles,
      },
    });

  const fileGroups = React.useMemo(
    () => groupFilesByContentType(conversationFiles),
    [conversationFiles]
  );

  const hasFiles = conversationFiles.length > 0;

  const handleFileClick = () => {
    setIsOpen(false);
  };

  if (isConversationFilesLoading && isOpen) {
    return (
      <Button
        size="sm"
        variant="ghost"
        icon={FolderIcon}
        tooltip="Loading files..."
        disabled
      />
    );
  }

  return (
    <PopoverRoot
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        // If we're opening, we enable the hook right away, if we're closing,
        // we disable it after the animation is done to avoid flickering.
        if (open) {
          setShouldDisableConversationFiles(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="sm"
          tooltip="See generated content"
          icon={isOpen ? FolderOpenIcon : FolderIcon}
          variant="ghost"
        />
      </PopoverTrigger>
      <PopoverContent
        className="flex w-96 flex-col gap-3"
        align="end"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onAnimationEnd={() => {
          if (!isOpen) {
            setShouldDisableConversationFiles(true);
          }
        }}
      >
        <ScrollArea className="flex flex-col gap-3">
          <div className="heading-lg text-primary dark:text-primary-night">
            Generated Content
          </div>

          {!hasFiles ? (
            <EmptyFilesState />
          ) : (
            <div className="space-y-4">
              {fileGroups.map((group) => (
                <FileGroupSection
                  key={group.key}
                  group={group}
                  owner={owner}
                  onFileClick={handleFileClick}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </PopoverRoot>
  );
}
