import { ContentMessage, Markdown, Separator } from "@dust-tt/sparkle";

import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { isMCPActionType } from "@app/components/assistant/conversation/actions/AgentMessageActions";
import type { LightWorkspaceType, ParsedContentItem } from "@app/types";

interface AgentStepProps {
  stepNumber: number;
  entries?: ParsedContentItem[];
  reasoningContent?: string;
  isStreaming?: boolean;
  streamingActions?: Array<{ type: "tool_action"; id: number }>;
  streamActionProgress: Map<number, any>;
  owner: LightWorkspaceType;
  messageStatus: "created" | "succeeded" | "failed" | "cancelled";
  showSeparator?: boolean;
}

export function PanelAgentStep({
  stepNumber,
  entries,
  reasoningContent,
  isStreaming = false,
  streamingActions = [],
  streamActionProgress,
  owner,
  messageStatus,
  showSeparator = false,
}: AgentStepProps) {
  return (
    <div className="flex flex-col gap-4 duration-500 animate-in fade-in slide-in-from-left-2">
      {showSeparator && <Separator className="my-4" />}

      <div className="flex items-center gap-2">
        <span className="text-size w-fit self-start text-lg font-semibold">
          Step {stepNumber}
        </span>
      </div>

      {reasoningContent !== undefined && (
        <div className="transition-all duration-300 animate-in fade-in slide-in-from-bottom-1">
          <ContentMessage variant="primary" size="lg">
            <Markdown
              content={reasoningContent}
              isStreaming={isStreaming}
              forcedTextSize="text-sm"
              textColor="text-muted-foreground"
              isLastMessage={false}
            />
          </ContentMessage>
        </div>
      )}

      {/* Parsed Entries (for completed steps) */}
      {entries?.map((entry: ParsedContentItem, idx: number) => {
        if (entry.kind === "reasoning") {
          return (
            <div key={`reasoning-${stepNumber}-${idx}`}>
              <ContentMessage variant="primary" size="lg">
                <Markdown
                  content={entry.content}
                  isStreaming={false}
                  forcedTextSize="text-sm"
                  textColor="text-muted-foreground"
                  isLastMessage={false}
                />
              </ContentMessage>
            </div>
          );
        }

        if (entry.kind !== "action") {
          return null;
        }

        const streamProgress = streamActionProgress.get(
          entry.action.id
        )?.progress;

        return (
          <div key={`action-${entry.action.id}`}>
            <MCPActionDetails
              viewType="sidebar"
              action={entry.action}
              lastNotification={streamProgress ?? null}
              owner={owner}
              messageStatus={messageStatus}
            />
          </div>
        );
      })}

      {/* Streaming Actions (for current step) */}
      {streamingActions.length > 0 && (
        <div className="mt-4">
          {streamingActions.map((action) => {
            if (!isMCPActionType(action)) {
              return null;
            }

            const streamProgress = streamActionProgress.get(
              action.id
            )?.progress;
            const lastNotification = streamProgress ?? null;

            return (
              <div key={`streaming-action-${action.id}`} className="mb-4">
                <MCPActionDetails
                  viewType="sidebar"
                  action={action}
                  lastNotification={lastNotification}
                  owner={owner}
                  messageStatus="created"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
