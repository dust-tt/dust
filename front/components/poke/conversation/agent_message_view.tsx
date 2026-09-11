import { PokeMessageConsumptionInspector } from "@app/components/poke/conversation/message_consumption_inspector";
import type { ChipColor } from "@app/components/poke/conversation/message_metadata";
import {
  formatDurationMs,
  MetadataItem,
  StatusBadge,
} from "@app/components/poke/conversation/message_metadata";
import {
  getProviderPassthroughEntries,
  ProviderPassthroughView,
} from "@app/components/poke/conversation/provider_passthrough_view";
import { ToolActionView } from "@app/components/poke/conversation/tool_action_view";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { PokeAgentMessageType } from "@app/types/poke";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ButtonGroup,
  buttonVariants,
  ConversationMessage,
  cn,
  LinkWrapper,
  Markdown,
} from "@dust-tt/sparkle";
import { useState } from "react";

const AGENT_STATUS: Record<
  AgentMessageStatus,
  { label: string; color: ChipColor }
> = {
  created: { label: "generating", color: "warning" },
  succeeded: { label: "succeeded", color: "success" },
  failed: { label: "failed", color: "warning" },
  cancelled: { label: "cancelled", color: "primary" },
  interrupted: { label: "cancelled", color: "primary" },
  gracefully_stopped: {
    label: "stopped",
    color: "primary",
  },
};

function getLangfuseTraceUrl({
  langfuseUiBaseUrl,
  runId,
}: {
  langfuseUiBaseUrl: string;
  runId: string;
}) {
  return `${langfuseUiBaseUrl}/traces?filter=metadata%3BstringObject%3BdustTraceId%3B%3D%3B${encodeURIComponent(runId)}`;
}

interface AgentTraceLinksProps {
  runUrls: NonNullable<PokeAgentMessageType["runUrls"]>;
  langfuseUiBaseUrl: string | null;
}

function AgentTraceLinks({ runUrls, langfuseUiBaseUrl }: AgentTraceLinksProps) {
  return (
    <div className="flex min-w-full flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {runUrls.map(({ runId, url, isLLM }, index) => {
          const traceLabelSuffix = runUrls.length > 1 ? ` ${index + 1}` : "";

          return (
            <ButtonGroup key={runId}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={runId}
                className={buttonVariants({ variant: "outline", size: "xs" })}
              >
                Poke{traceLabelSuffix}
              </a>
              {isLLM && langfuseUiBaseUrl && (
                <a
                  href={getLangfuseTraceUrl({ langfuseUiBaseUrl, runId })}
                  title={`Open ${runId} in Langfuse`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "xs" })}
                >
                  Langfuse{traceLabelSuffix}
                </a>
              )}
            </ButtonGroup>
          );
        })}
      </div>
    </div>
  );
}

interface AgentMessageViewProps {
  conversationId: string;
  isConsumptionOpen: boolean;
  message: PokeAgentMessageType;
  onConsumptionOpenChange: (open: boolean) => void;
  onConsumptionPanelExitComplete: () => void;
  onConsumptionPanelRefChange: (element: HTMLDivElement | null) => void;
  useMarkdown: boolean;
  owner: LightWorkspaceType;
  langfuseUiBaseUrl: string | null;
}

export const AgentMessageView = ({
  conversationId,
  isConsumptionOpen,
  message,
  onConsumptionOpenChange,
  onConsumptionPanelExitComplete,
  onConsumptionPanelRefChange,
  useMarkdown,
  owner,
  langfuseUiBaseUrl,
}: AgentMessageViewProps) => {
  const [expandedActions, setExpandedActions] = useState<Set<string>>(
    new Set()
  );
  const [
    expandedProviderPassthroughEntries,
    setExpandedProviderPassthroughEntries,
  ] = useState<Set<string>>(new Set());

  const toggleAction = (actionId: string) => {
    setExpandedActions((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  };
  const toggleProviderPassthroughEntry = (entryKey: string) => {
    setExpandedProviderPassthroughEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryKey)) {
        next.delete(entryKey);
      } else {
        next.add(entryKey);
      }
      return next;
    });
  };

  const providerPassthroughEntries = getProviderPassthroughEntries(
    message.contents
  );
  const toolExecutionTimelineEntries = [
    ...providerPassthroughEntries.map((entry) => ({
      type: "provider_passthrough" as const,
      entry,
      step: entry.step,
    })),
    ...message.actions.map((action) => ({
      type: "action" as const,
      action,
      step: action.step,
    })),
  ].sort((a, b) => a.step - b.step);

  return (
    <div className="w-full">
      <ConversationMessage
        pictureUrl={message.configuration.pictureUrl}
        name={message.configuration.name}
        renderName={() => (
          <>
            {message.configuration.name}{" "}
            <LinkWrapper
              href={`/poke/${owner.sId}/assistants/${message.configuration.sId}`}
              target="_blank"
              className="text-highlight"
            >
              ({message.configuration.sId})
            </LinkWrapper>
          </>
        )}
        type="agent"
      >
        <div className="flex min-w-0 flex-col gap-3">
          <div className="min-w-0">
            {message.content &&
              (useMarkdown ? (
                <Markdown content={message.content} />
              ) : (
                <div className="whitespace-pre-wrap">{message.content}</div>
              ))}
          </div>
          {message.error && (
            <div
              className={cn(
                "rounded-md border border-border-warning bg-background",
                "p-2 text-sm font-medium text-warning"
              )}
            >
              {message.error.message}
            </div>
          )}
          <div className="rounded-md border border-separator bg-muted-background p-2">
            <div className="flex flex-wrap items-center gap-4">
              <StatusBadge
                label={AGENT_STATUS[message.status]?.label ?? message.status}
                color={AGENT_STATUS[message.status]?.color ?? "primary"}
              />
              <MetadataItem label="date">
                {new Date(message.created).toLocaleString()}
              </MetadataItem>
              <MetadataItem label="version">{message.version}</MetadataItem>
              <MetadataItem label="message" mono>
                {message.sId}
              </MetadataItem>
              {message.modelInteractionDurationMs != null && (
                <MetadataItem label="LLM">
                  {formatDurationMs(message.modelInteractionDurationMs)}
                </MetadataItem>
              )}
              {message.completionDurationMs != null && (
                <MetadataItem label="total">
                  {formatDurationMs(message.completionDurationMs)}
                </MetadataItem>
              )}
              {message.runUrls && message.runUrls.length > 0 && (
                <AgentTraceLinks
                  runUrls={message.runUrls}
                  langfuseUiBaseUrl={langfuseUiBaseUrl}
                />
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <PokeMessageConsumptionInspector
              billedCredits={message.costCredits}
              conversationId={conversationId}
              isOpen={isConsumptionOpen}
              messageId={message.sId}
              onOpenChange={onConsumptionOpenChange}
              onPanelExitComplete={onConsumptionPanelExitComplete}
              onPanelRefChange={onConsumptionPanelRefChange}
              subAgentBilledCredits={message.subAgentCostCredits}
              workspaceId={owner.sId}
            />
            {toolExecutionTimelineEntries.map((timelineEntry) => {
              switch (timelineEntry.type) {
                case "provider_passthrough": {
                  const { entry } = timelineEntry;
                  return (
                    <ProviderPassthroughView
                      key={`provider-passthrough-${entry.key}`}
                      entry={entry}
                      isExpanded={expandedProviderPassthroughEntries.has(
                        entry.key
                      )}
                      onToggle={() => toggleProviderPassthroughEntry(entry.key)}
                    />
                  );
                }
                case "action": {
                  const { action } = timelineEntry;
                  return (
                    <ToolActionView
                      key={`action-${action.sId}`}
                      action={action}
                      isExpanded={expandedActions.has(action.sId)}
                      onToggle={() => toggleAction(action.sId)}
                    />
                  );
                }
                default:
                  return assertNever(timelineEntry);
              }
            })}
          </div>
        </div>
      </ConversationMessage>
    </div>
  );
};
