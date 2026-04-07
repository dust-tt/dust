import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import {
  getPendingToolCallKey,
  type PendingToolCall,
} from "@app/components/assistant/conversation/types";
import { getToolCallDisplayLabel } from "@app/lib/actions/tool_display_labels";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { ParsedContentItem } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, Markdown, Spinner } from "@dust-tt/sparkle";

interface AgentStepProps {
  stepNumber: number;
  entries?: ParsedContentItem[];
  reasoningContent?: string;
  isStreaming?: boolean;
  pendingToolCalls?: PendingToolCall[];
  streamingActions?: AgentMCPActionWithOutputType[];
  streamActionProgress: Map<number, any>;
  owner: LightWorkspaceType;
  messageStatus:
    | "created"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "gracefully_stopped";
  showSeparator?: boolean;
}

export function PanelAgentStep({
  stepNumber,
  entries,
  reasoningContent,
  isStreaming = false,
  pendingToolCalls = [],
  streamingActions = [],
  streamActionProgress,
  owner,
  messageStatus,
}: AgentStepProps) {
  return (
    <div className="flex flex-col gap-4 duration-500 animate-in fade-in slide-in-from-left-2">
      {reasoningContent !== undefined && (
        <div className="transition-all duration-300 animate-in fade-in slide-in-from-bottom-1">
          <ContentMessage variant="primary" size="lg">
            <Markdown
              content={reasoningContent}
              isStreaming={isStreaming}
              streamingState={isStreaming ? "streaming" : "none"}
              enableAnimation
              animationDurationSeconds={0.3}
              delimiter=" "
              forcedTextSize="text-sm"
              textColor="text-muted-foreground dark:text-muted-foreground-night"
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
                  textColor="text-muted-foreground dark:text-muted-foreground-night"
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
              displayContext="sidebar-all-actions"
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
            const streamProgress = streamActionProgress.get(
              action.id
            )?.progress;
            const lastNotification = streamProgress ?? null;

            return (
              <div key={`streaming-action-${action.id}`} className="mb-4">
                <MCPActionDetails
                  displayContext="sidebar-all-actions"
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

      {pendingToolCalls.length > 0 && (
        <ContentMessage variant="primary" className="min-h-fit p-3">
          <div className="flex w-full flex-row">
            <div className="flex flex-col gap-y-1">
              {pendingToolCalls.map((pendingToolCall, index) => (
                <span
                  key={getPendingToolCallKey(pendingToolCall, index)}
                  className="text-sm text-muted-foreground dark:text-muted-foreground-night"
                >
                  Preparing to{" "}
                  <span className="font-medium text-foreground dark:text-foreground-night">
                    {getToolCallDisplayLabel(pendingToolCall.toolName)}
                  </span>
                  ...
                </span>
              ))}
            </div>
            <span className="flex-grow"></span>
            <div className="w-8 self-start pl-4 pt-0.5">
              <Spinner size="xs" />
            </div>
          </div>
        </ContentMessage>
      )}
    </div>
  );
}
