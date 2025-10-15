import {
  ActionFrameIcon,
  Citation,
  CitationDescription,
  CitationGrid,
  CitationTitle,
  Icon,
} from "@dust-tt/sparkle";

import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { formatCalendarDate } from "@app/lib/utils/timestamps";
import type { LightAgentMessageType } from "@app/types";
import { frameContentType, getTime } from "@app/types";

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
            <div className="flex flex-row items-center">
              <CitationTitle>{file.title}</CitationTitle>
            </div>
            <CitationDescription>
              <div className="flow-row flex items-center gap-2">
                {variant === "grid" && file.createdAt && (
                  <div>
                    <span>{formatCalendarDate(file.createdAt)}</span>
                    <span className="mx-1">{"\u00B7"}</span>
                    <time>{getTime(file.createdAt)}</time>
                  </div>
                )}
                {variant === "list" && description && (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
                    <Icon visual={ActionFrameIcon} size="xs" />
                    {description}
                  </p>
                )}
              </div>
            </CitationDescription>
          </Citation>
        );
      })}
    </CitationGrid>
  );
}
