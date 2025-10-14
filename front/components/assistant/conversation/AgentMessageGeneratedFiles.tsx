import {
  Citation,
  CitationDescription,
  CitationGrid,
  CitationTitle,
  Icon,
  SparklesIcon,
} from "@dust-tt/sparkle";

import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { LightAgentMessageType } from "@app/types";
import { frameContentType } from "@app/types";

// Interactive content files.

function getDescriptionForContentType(
  file: LightAgentMessageType["generatedFiles"][number]
) {
  if (file.contentType === frameContentType) {
    return "Frames";
  }

  return null;
}

interface AgentMessageInteractiveContentGeneratedFilesProps {
  files: LightAgentMessageType["generatedFiles"];
  onClick?: () => void;
  variant?: "list" | "grid";
}

export function AgentMessageInteractiveContentGeneratedFiles({
  files,
  onClick,
  variant = "list",
}: AgentMessageInteractiveContentGeneratedFilesProps) {
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
            type: "interactive_content",
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
