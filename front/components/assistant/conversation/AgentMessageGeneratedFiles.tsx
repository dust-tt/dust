import {
  Citation,
  CitationDescription,
  CitationGrid,
  CitationIcons,
  CitationIndex,
  CitationTitle,
  Icon,
  SparklesIcon,
} from "@dust-tt/sparkle";

import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";
import type { LightAgentMessageType } from "@app/types";
import { clientExecutableContentType } from "@app/types";

interface DefaultAgentMessageGeneratedFilesProps {
  document: MarkdownCitation;
  index: number;
}

function CitationContent({
  document,
  index,
}: DefaultAgentMessageGeneratedFilesProps) {
  return (
    <>
      <CitationIcons>
        {index !== -1 && <CitationIndex>{index}</CitationIndex>}
        {document.icon}
      </CitationIcons>
      <CitationTitle>{document.title}</CitationTitle>
    </>
  );
}

export function DefaultAgentMessageGeneratedFiles({
  document,
  index,
}: DefaultAgentMessageGeneratedFilesProps) {
  return (
    <Citation href={document.href} tooltip={document.title}>
      <CitationContent document={document} index={index} />
    </Citation>
  );
}

// Content creation files.

function getDescriptionForContentType(
  file: LightAgentMessageType["generatedFiles"][number]
) {
  if (file.contentType === clientExecutableContentType) {
    return "Visualization";
  }

  return null;
}

interface AgentMessageContentCreationGeneratedFilesProps {
  files: LightAgentMessageType["generatedFiles"];
  onClick?: () => void;
  variant?: "list" | "grid";
}

export function AgentMessageContentCreationGeneratedFiles({
  files,
  onClick,
  variant = "list",
}: AgentMessageContentCreationGeneratedFilesProps) {
  const { openPanel } = useConversationSidePanelContext();

  if (files.length === 0) {
    return null;
  }

  return (
    <CitationGrid variant={variant}>
      {files.map((file) => {
        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault();
          openPanel({
            type: "content_creation",
            fileId: file.fileId,
          });
          onClick?.();
        };

        const description = getDescriptionForContentType(file);

        return (
          <Citation
            key={file.fileId}
            tooltip={file.title}
            onClick={handleClick}
            className="bg-gray-50 dark:bg-gray-800"
          >
            <div className="flex flex-row items-center gap-2">
              <CitationTitle>{file.title}</CitationTitle>
              {description && variant === "list" && (
                <CitationTitle className="text-muted-foreground dark:text-muted-foreground-night">
                  {description}
                </CitationTitle>
              )}
            </div>
            <CitationDescription>
              <div className="flow-row flex items-center gap-2">
                <Icon visual={SparklesIcon} size="xs" />
                Frame
              </div>
            </CitationDescription>
          </Citation>
        );
      })}
    </CitationGrid>
  );
}
