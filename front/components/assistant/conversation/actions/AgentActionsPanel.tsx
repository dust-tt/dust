import { ContentMessage, Markdown, Separator, Spinner } from "@dust-tt/sparkle";
import React, { useEffect, useRef } from "react";

import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { AgentActionsPanelHeader } from "@app/components/assistant/conversation/actions/AgentActionsPanelHeader";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useConversationMessage } from "@app/lib/swr/conversations";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";

interface AgentActionsPanelProps {
  conversation: ConversationWithoutContentType | null;
  owner: LightWorkspaceType;
}

export function AgentActionsPanel({
  conversation,
  owner,
}: AgentActionsPanelProps) {
  const {
    onPanelClosed,
    data: messageId,
    metadata: messageMetadata,
  } = useConversationSidePanelContext();

  const { message: fullAgentMessage, isMessageLoading } =
    useConversationMessage({
      conversationId: conversation?.sId ?? null,
      workspaceId: owner.sId,
      messageId: messageId ?? null,
    });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [fullAgentMessage]);

  if (
    !messageId ||
    !messageMetadata ||
    !fullAgentMessage ||
    fullAgentMessage.type !== "agent_message"
  ) {
    onPanelClosed();
    return null;
  }

  const { actionProgress } = messageMetadata;
  const isActing = fullAgentMessage.status === "created";
  const steps = fullAgentMessage.parsedContents;

  return (
    <div className="flex h-full flex-col">
      <AgentActionsPanelHeader
        title="Breakdown of the tools used"
        onClose={onPanelClosed}
      />
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 pb-12"
      >
        {isMessageLoading ? (
          <div className="flex justify-center">
            <Spinner variant="color" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Object.entries(steps).map(([step, entries]) => {
              if (!entries || entries.length === 0) {
                return null;
              }
              return (
                <div
                  className="flex flex-col gap-4 duration-1000 animate-in fade-in"
                  key={step}
                >
                  {step !== "1" && <Separator className="my-4" />}
                  <span className="text-size w-fit self-start text-lg font-semibold">
                    Step {step}
                  </span>

                  {entries.map((entry, idx) => {
                    if (entry.kind === "reasoning") {
                      return (
                        <ContentMessage
                          key={`reasoning-${step}-${idx}`}
                          variant="primary"
                          size="lg"
                        >
                          <Markdown
                            content={entry.content}
                            isStreaming={false}
                            forcedTextSize="text-sm"
                            textColor="text-muted-foreground"
                            isLastMessage={false}
                          />{" "}
                        </ContentMessage>
                      );
                    } else {
                      const lastNotification =
                        actionProgress.get(entry.action.id)?.progress ?? null;
                      return (
                        <div key={`action-${entry.action.id}`}>
                          <MCPActionDetails
                            viewType="sidebar"
                            action={entry.action}
                            lastNotification={lastNotification}
                            owner={owner}
                            messageStatus={fullAgentMessage.status}
                          />
                        </div>
                      );
                    }
                  })}
                </div>
              );
            })}
            {isActing && (
              <div className="flex justify-center">
                <Spinner variant="color" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
