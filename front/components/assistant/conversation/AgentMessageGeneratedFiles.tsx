import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { LightAgentMessageType } from "@app/types/assistant/conversation";
import {
  frameSlideshowContentType,
  isFrameContentType,
} from "@app/types/files";
import {
  ActionFrame,
  Avatar,
  Card,
  ChevronRight,
  CitationGrid,
  cn,
  Icon,
} from "@dust-tt/sparkle";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import uniqBy from "lodash/uniqBy";
import { useMemo } from "react";
import type { AgentMessageWithStreaming, VirtuosoMessage } from "./types";

function getDescriptionForContentType(
  file: LightAgentMessageType["generatedFiles"][number]
) {
  if (file.contentType === frameSlideshowContentType) {
    return msg`Presentation`;
  }

  if (isFrameContentType(file.contentType)) {
    return msg`Frame`;
  }

  return null;
}

interface AgentMessageInteractiveContentGeneratedFilesProps {
  agentMessage: AgentMessageWithStreaming;
}

export function AgentMessageInteractiveContentGeneratedFiles({
  agentMessage,
}: AgentMessageInteractiveContentGeneratedFilesProps) {
  const { t } = useLingui();
  const { openPanel } = useConversationSidePanelContext();

  const files = useMemo(
    () =>
      uniqBy(
        agentMessage.generatedFiles.filter((file) =>
          isFrameContentType(file.contentType)
        ),
        (file) => file.fileId ?? file.filePath
      ),
    [agentMessage.generatedFiles]
  );

  const methods = useVirtuosoMethods<VirtuosoMessage>();
  const followupAgentMessageFiles = methods.data
    .get()
    .map((m) => {
      return m.type === "agent_message" &&
        m.rank > agentMessage.rank &&
        m.visibility !== "deleted"
        ? m.generatedFiles
        : [];
    })
    .flat();

  if (files.length === 0) {
    return null;
  }

  const disabled = followupAgentMessageFiles.some((file) =>
    files.some((f) => f.fileId === file.fileId)
  );

  return (
    <CitationGrid variant="list">
      {files.map((file) => {
        if (!file.fileId) {
          return null;
        }

        const { fileId } = file;
        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault();
          openPanel({
            type: "interactive_content",
            fileId,
            // Match auto-open's `fileId@updatedAt` hash so a click on an
            // already-open Frame does not remount with a bare `fileId`.
            ...(file.updatedAt !== undefined
              ? { timestamp: String(file.updatedAt) }
              : {}),
            openedFrom: { source: "user", uiElement: "message_frame_card" },
          });
        };

        const descriptionDescriptor = getDescriptionForContentType(file);
        const description = descriptionDescriptor
          ? t(descriptionDescriptor)
          : null;

        return (
          <Card
            key={fileId}
            variant="secondary"
            size="sm"
            onClick={disabled ? undefined : handleClick}
            disabled={disabled}
            className="flex-row items-center gap-3"
          >
            <Avatar
              size="md"
              icon={ActionFrame}
              backgroundColor={
                disabled ? "bg-muted-background" : "bg-highlight-50"
              }
              iconColor={disabled ? "text-primary-muted" : "text-highlight"}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  "heading-sm truncate",
                  disabled && "text-primary-muted"
                )}
              >
                {file.title}
              </span>
              {description && (
                <span
                  className={cn(
                    "truncate text-sm",
                    disabled ? "text-primary-muted" : "text-muted-foreground"
                  )}
                >
                  {description}
                </span>
              )}
            </div>
            {!disabled && (
              <Icon
                visual={ChevronRight}
                size="sm"
                className="mr-1 shrink-0 text-muted-foreground"
              />
            )}
          </Card>
        );
      })}
    </CitationGrid>
  );
}
