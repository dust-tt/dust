import {
  Button,
  CitationGrid,
  DocumentIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import React from "react";

import {
  DefaultAgentMessageGeneratedFiles,
  InteractiveAgentMessageGeneratedFiles,
} from "@app/components/assistant/conversation/AgentMessageGeneratedFiles";
import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import { useConversationFiles } from "@app/lib/swr/conversations";
import type {
  AllSupportedFileContentType,
  LightWorkspaceType,
} from "@app/types";
import { clientExecutableContentType } from "@app/types";

// Explicit content type groupings.
const CONTENT_TYPE_GROUPS = {
  [clientExecutableContentType]: "Visualization",
  "application/json": "JSON",
  "text/csv": "CSV",
  "text/plain": "Text",
  "text/markdown": "Markdown",
} satisfies Partial<Record<AllSupportedFileContentType, string>>;

type ContentTypeGroup = keyof typeof CONTENT_TYPE_GROUPS;

type GroupedFiles = Partial<
  Record<AllSupportedFileContentType | "other", ActionGeneratedFileType[]>
>;

interface FileRendererProps {
  files: ActionGeneratedFileType[];
  owner: LightWorkspaceType;
}

function FileRenderer({ files, owner }: FileRendererProps) {
  return (
    <CitationGrid variant="grid">
      {files.map((file, idx) => (
        <DefaultAgentMessageGeneratedFiles
          key={file.fileId}
          document={{
            href: `/api/w/${owner.sId}/files/${file.fileId}`,
            icon: <DocumentIcon />,
            title: file.title,
          }}
          index={idx}
        />
      ))}
    </CitationGrid>
  );
}

interface FileGroupProps {
  title: string;
  files: ActionGeneratedFileType[];
  owner: LightWorkspaceType;
  contentType: string;
}

function FileGroup({ title, files, owner, contentType }: FileGroupProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-primary dark:text-primary-night">
        {title}
      </div>
      <div>
        {contentType === clientExecutableContentType ? (
          <InteractiveAgentMessageGeneratedFiles files={files} variant="grid" />
        ) : (
          <FileRenderer files={files} owner={owner} />
        )}
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

  const { conversationFiles, isConversationFilesLoading } =
    useConversationFiles({
      conversationId,
      owner,
    });

  const groupedFiles = React.useMemo((): GroupedFiles => {
    const groups: GroupedFiles = {};

    for (const file of conversationFiles) {
      const key =
        file.contentType in CONTENT_TYPE_GROUPS ? file.contentType : "other";

      groups[key] ??= [];
      groups[key]!.push(file);
    }

    return groups;
  }, [conversationFiles]);

  const hasFiles = conversationFiles.length > 0;
  const fileCount = conversationFiles.length;

  if (isConversationFilesLoading) {
    return (
      <Button
        size="sm"
        variant="ghost"
        icon={DocumentIcon}
        tooltip="Loading files..."
        disabled
      />
    );
  }

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          tooltip={
            hasFiles
              ? `Files generated (${fileCount})`
              : "No files have been generated in this conversation yet."
          }
          icon={DocumentIcon}
          variant="ghost"
          disabled={!hasFiles}
        />
      </PopoverTrigger>
      <PopoverContent className="flex w-96 flex-col gap-3" align="end">
        <div className="font-semibold text-primary dark:text-primary-night">
          Generated Content
        </div>

        {!hasFiles ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No files have been generated in this conversation yet.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedFiles).map(([groupKey, files]) => {
              if (!files?.length) {
                return null;
              }

              const title =
                groupKey === "other"
                  ? "Other"
                  : CONTENT_TYPE_GROUPS[groupKey as ContentTypeGroup];

              return (
                <FileGroup
                  key={groupKey}
                  title={title}
                  files={files}
                  owner={owner}
                  contentType={groupKey}
                />
              );
            })}
          </div>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}
