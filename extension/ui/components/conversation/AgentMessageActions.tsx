import type { AgentStateClassification } from "@app/ui/components/conversation/AgentMessage";
import type {
  AgentMessagePublicType,
  LightWorkspaceType,
} from "@dust-tt/client";
import { assertNever, TOOL_RUNNING_LABEL } from "@dust-tt/client";
import { Chip, cn, ContentMessage } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";
interface AgentMessageActionsProps {
  agentMessage: AgentMessagePublicType;
  lastAgentStateClassification: AgentStateClassification;
  owner: LightWorkspaceType;
}

// function isMCPActionType(
//   action: { type: "tool_action"; id: number } | undefined
// ): action is MCPActionType {
//   return action !== undefined && "functionCallName" in action;
// }

export function AgentMessageActions({
  agentMessage,
  lastAgentStateClassification,
  owner,
}: AgentMessageActionsProps) {
  const lastAction = agentMessage.actions[agentMessage.actions.length - 1];
  const hasActions = agentMessage.actions.length > 0;
  const chainOfThought = agentMessage.chainOfThought || "";

  return lastAgentStateClassification !== "done" ? (
    <div
      className={cn(
        "flex max-w-[500px] flex-col gap-y-4",
        lastAction ? "cursor-pointer" : ""
      )}
    >
      {/* TODO: hide chain of thoughts while action is running */}
      <ContentMessage variant="primary">
        <div className="flex w-full flex-row">
          {!chainOfThought ? (
            <AnimatedText variant="primary">Thinking...</AnimatedText>
          ) : (
            <Markdown
              content={chainOfThought}
              isStreaming={false}
              forcedTextSize="text-sm"
              textColor="text-muted-foreground"
              isLastMessage={false}
            />
          )}
          <span className="flex-grow"></span>
          <div className="w-8 self-start pl-4">
            {lastAgentStateClassification === "thinking" && (
              <Spinner size="xs" />
            )}
          </div>
        </div>
      </ContentMessage>
      {isMCPActionType(lastAction) &&
        lastAgentStateClassification === "acting" && (
          <Card variant="secondary" size="sm">
            <MCPActionDetails
              viewType="conversation"
              action={lastAction}
              owner={owner}
              lastNotification={null}
              defaultOpen={true}
            />
          </Card>
        )}
    </div>
  ) : (
    <div className="flex flex-col items-start gap-y-4">
      {hasActions && (
        <Button
          size="sm"
          label="Tools inspection"
          icon={CommandLineIcon}
          variant="outline"
          onClick={onClick}
        />
      )}

      {/* TODO: remove this once we have chain of thought in sidepanel */}
      {chainOfThought && (
        <div>
          <ContentMessage variant="primary">
            <div className="flex w-full flex-row">
              <Markdown
                content={chainOfThought}
                isStreaming={false}
                forcedTextSize="text-sm"
                textColor="text-muted-foreground"
                isLastMessage={false}
              />
            </div>
          </ContentMessage>
        </div>
      )}
    </div>
  );
}
