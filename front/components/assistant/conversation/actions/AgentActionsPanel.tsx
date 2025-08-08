import { ContentMessage, Markdown, Separator, Spinner } from "@dust-tt/sparkle";
import React from "react";

import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { AgentActionsPanelHeader } from "@app/components/assistant/conversation/actions/AgentActionsPanelHeader";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { MCPActionType } from "@app/lib/actions/mcp";
import { useConversationMessage } from "@app/lib/swr/conversations";
import {
  type ConversationType,
  type LightWorkspaceType,
  type MessageWithRankType,
} from "@app/types";
import {
  isFunctionCallContent,
  isReasoningContent,
  isTextContent,
} from "@app/types/assistant/agent_message_content";

interface AgentActionsPanelProps {
  conversation: ConversationType | null;
  owner: LightWorkspaceType;
}

type Content =
  | { kind: "reasoning"; content: string }
  | { kind: "action"; action: MCPActionType };
type Steps = Record<number, Array<Content>>;

function groupContentsByStep(
  fullAgentMessage: Extract<MessageWithRankType, { type: "agent_message" }>
): Steps {
  const steps: Steps = {};
  for (const c of fullAgentMessage.contents) {
    const step = c.step + 1;
    if (!steps[step]) steps[step] = [];

    if (isReasoningContent(c.content)) {
      const reasoning = c.content.value.reasoning;
      if (reasoning && reasoning.trim()) {
        steps[step].push({ kind: "reasoning", content: reasoning });
      }
      continue;
    }

    if (isTextContent(c.content)) {
      const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
      let match: RegExpExecArray | null;
      while ((match = thinkingRegex.exec(c.content.value)) !== null) {
        const extracted = match[1].trim();
        if (extracted) {
          steps[step].push({ kind: "reasoning", content: extracted });
        }
      }
      continue;
    }

    if (isFunctionCallContent(c.content)) {
      const functionCallId = c.content.value.id;
      const matchingAction = fullAgentMessage.actions.find(
        (a) => a.functionCallId === functionCallId
      );
      if (matchingAction) {
        steps[step].push({ kind: "action", action: matchingAction });
      }
      continue;
    }
  }
  return steps;
}

export function AgentActionsPanel({
  conversation,
  owner,
}: AgentActionsPanelProps) {
  const {
    closePanel,
    data: messageId,
    metadata: messageMetadata,
  } = useConversationSidePanelContext();

  const { message: fullAgentMessage, isMessageLoading } =
    useConversationMessage({
      conversationId: conversation?.sId ?? null,
      workspaceId: owner.sId,
      messageId: messageId ?? null,
    });

  if (
    !messageId ||
    !messageMetadata ||
    !fullAgentMessage ||
    fullAgentMessage.type !== "agent_message"
  ) {
    return null;
  }

  const { actionProgress } = messageMetadata;
  const isActing = fullAgentMessage.status === "created";
  const steps = groupContentsByStep(fullAgentMessage);

  return (
    <div className="flex h-full flex-col">
      <AgentActionsPanelHeader
        title="Breakdown of the tools used"
        onClose={closePanel}
      />
      <div className="flex-1 overflow-y-auto p-4">
        {isMessageLoading ? (
          <div className="flex justify-center">
            <Spinner variant="color" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Object.entries(steps).map(([step, entries]) => {
              return (
                <>
                  {step !== "1" && <Separator className="my-4" />}
                  <div
                    className="flex flex-col gap-4 duration-1000 animate-in fade-in"
                    key={step}
                  >
                    <p className="self-center font-semibold text-muted-foreground dark:text-muted-foreground-night">
                      Step {step}
                    </p>

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
                              action={entry.action}
                              lastNotification={lastNotification}
                              defaultOpen={true}
                              owner={owner}
                              messageStatus={fullAgentMessage.status}
                            />
                          </div>
                        );
                      }
                    })}
                  </div>
                </>
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
