import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { MCPImageGenerationGroupedDetails } from "@app/components/actions/mcp/details/MCPImageGenerationActionDetails";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type {
  ActionProgressState,
  AgentStateClassification,
} from "@app/components/assistant/conversation/types";
import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import {
  GENERATE_IMAGE_TOOL_NAME,
  TOOLSETS_ENABLE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
} from "@app/types/assistant/conversation";
import { isLightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Collapsible,
  CollapsibleContent,
  Icon,
  Markdown,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

interface InlineActionRowProps {
  label: string;
  isRunning: boolean;
  onLabelClick: () => void;
  headerExtra?: React.ReactNode;
  children?: React.ReactNode;
  // When true, skip DOM measurement and assume children have visible content.
  // Needed for completed rows whose children are inside a closed Collapsible
  // (Radix doesn't mount them, so scrollHeight is always 0).
  forceHasContent?: boolean;
}

function InlineActionRow({
  label,
  isRunning,
  onLabelClick,
  headerExtra,
  children,
  forceHasContent = false,
}: InlineActionRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Detect whether children actually render visible content by measuring the
  // container. React elements are always truthy even when they render nothing.
  const contentRef = useRef<HTMLDivElement>(null);
  const [detectedContent, setDetectedContent] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) {
      setDetectedContent(false);
      return;
    }
    const observer = new ResizeObserver(() => {
      setDetectedContent(el.scrollHeight > 0);
    });
    observer.observe(el);
    setDetectedContent(el.scrollHeight > 0);
    return () => observer.disconnect();
  }, []);

  const hasContent = forceHasContent || detectedContent;

  // While running, force-open when visible content is present (e.g. live CoT
  // streaming in). Once done, the user can toggle with the chevron.
  const effectiveOpen = isRunning && hasContent ? true : isOpen;

  return (
    <Collapsible open={effectiveOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-x-1 py-1">
        {isRunning && !hasContent && <Spinner size="xs" />}
        {!isRunning && !hasContent && (
          <Icon
            visual={CheckIcon}
            size="sm"
            className="text-muted-foreground"
          />
        )}
        {hasContent && (
          <button
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex items-center"
          >
            <Icon
              visual={effectiveOpen ? ChevronDownIcon : ChevronRightIcon}
              size="sm"
              className="text-muted-foreground"
            />
          </button>
        )}
        <div
          className="flex cursor-pointer items-center gap-x-2 text-muted-foreground dark:text-muted-foreground-night"
          onClick={onLabelClick}
        >
          {isRunning && hasContent && <Spinner size="xs" />}
          {headerExtra}
          <span className="heading-sm font-medium">{label}</span>
        </div>
      </div>
      <CollapsibleContent>
        <div ref={contentRef} className="max-h-[400px] overflow-y-auto pl-5">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function useToolsetServerView(
  action: AgentMCPActionWithOutputType,
  owner: LightWorkspaceType
) {
  const toolsetId =
    typeof action.params.toolsetId === "string"
      ? action.params.toolsetId
      : null;

  const { spaces } = useSpaces({
    kinds: ["global"],
    workspaceId: owner.sId,
  });
  const { serverViews } = useMCPServerViews({
    owner,
    space: spaces[0] ?? undefined,
    availability: "all",
  });

  return toolsetId
    ? (serverViews.find((v) => v.sId === toolsetId) ?? null)
    : null;
}

interface ToolsetEnableInlineRowProps {
  action: AgentMCPActionWithOutputType;
  owner: LightWorkspaceType;
  isRunning: boolean;
  onLabelClick: () => void;
}

function ToolsetEnableInlineRow({
  action,
  owner,
  isRunning,
  onLabelClick,
}: ToolsetEnableInlineRowProps) {
  const mcpServerView = useToolsetServerView(action, owner);

  const isFinal = isToolExecutionStatusFinal(action.status);
  const verb = isFinal ? "Enabled" : "Enabling";
  const toolName = mcpServerView
    ? getMcpServerViewDisplayName(mcpServerView)
    : null;
  const label = toolName ? `${verb} ${toolName} tool.` : `${verb} tool.`;

  return (
    <InlineActionRow
      label={label}
      isRunning={isRunning}
      onLabelClick={onLabelClick}
      headerExtra={
        mcpServerView ? (
          <Icon
            visual={getIcon(mcpServerView.server.icon)}
            size="sm"
            className="text-muted-foreground"
          />
        ) : undefined
      }
    />
  );
}

function getInlineActionLabel(action: AgentMCPActionWithOutputType): string {
  const isFinal = isToolExecutionStatusFinal(action.status);
  if (action.displayLabels) {
    const label = isFinal
      ? action.displayLabels.done
      : action.displayLabels.running;
    return `${label}.`;
  }
  const prefix = isFinal ? "Ran a tool" : "Running a tool";
  return action.functionCallName
    ? `${prefix}: ${asDisplayName(action.functionCallName)}.`
    : `${prefix}.`;
}

interface AgentMessageActionsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
  actionProgress: ActionProgressState;
  owner: LightWorkspaceType;
  savedChainOfThoughtByStep: Map<number, string>;
}

export function AgentMessageActions({
  agentMessage,
  lastAgentStateClassification,
  actionProgress,
  owner,
  savedChainOfThoughtByStep,
}: AgentMessageActionsProps) {
  const { openPanel, currentPanel, data } = useConversationSidePanelContext();

  const isAgentMessageWithActions =
    isLightAgentMessageWithActionsType(agentMessage);

  const actions = isAgentMessageWithActions ? agentMessage.actions : [];

  const imageGenActions = actions.filter(
    (a) =>
      a.internalMCPServerName === "image_generation" &&
      a.toolName === GENERATE_IMAGE_TOOL_NAME
  );

  const nonImageGenActions =
    imageGenActions.length > 1
      ? actions.filter(
          (a) =>
            !(
              a.internalMCPServerName === "image_generation" &&
              a.toolName === GENERATE_IMAGE_TOOL_NAME
            )
        )
      : actions;

  const sortedActions = [...nonImageGenActions].sort((a, b) => {
    if (a.step !== b.step) {
      return a.step - b.step;
    }
    return a.id - b.id;
  });

  const firstRender = useRef<boolean>(true);
  const openActionsPanel = () => {
    openPanel({
      type: "actions",
      messageId: agentMessage.sId,
    });
  };

  useEffect(() => {
    if (
      currentPanel === "actions" &&
      data !== agentMessage.sId &&
      agentMessage.content === null &&
      firstRender.current
    ) {
      openPanel({
        type: "actions",
        messageId: agentMessage.sId,
      });
    }
    firstRender.current = false;
  }, [agentMessage, currentPanel, data, openPanel]);

  const hasActions = sortedActions.length > 0 || imageGenActions.length > 1;
  const isThinking = lastAgentStateClassification === "thinking";

  // Remember that we saw a thinking phase so the row persists even when
  // chainOfThought is temporarily cleared (e.g. when an action arrives).
  const sawThinking = useRef(false);
  if (isThinking) {
    sawThinking.current = true;
  }

  const chainOfThought = agentMessage.chainOfThought?.trim() || null;

  // Hide inline actions once the agent is writing its response or done.
  if (
    lastAgentStateClassification === "done" ||
    lastAgentStateClassification === "writing"
  ) {
    return null;
  }

  // Show thinking row while actively thinking, or if we ever saw thinking
  // (chainOfThought gets temporarily cleared when actions arrive).
  const showThinkingRow = isThinking || sawThinking.current;

  if (!hasActions && !showThinkingRow) {
    return null;
  }

  // Group actions by step to interleave thinking rows between step groups.
  const stepGroups = new Map<number, AgentMCPActionWithOutputType[]>();
  for (const action of sortedActions) {
    const group = stepGroups.get(action.step);
    if (group) {
      group.push(action);
    } else {
      stepGroups.set(action.step, [action]);
    }
  }
  const steps = [...stepGroups.entries()].sort(([a], [b]) => a - b);

  function getCompletedThinkingLabel(startMs: number, endMs: number): string {
    const durationSeconds = Math.round((endMs - startMs) / 1000);
    if (durationSeconds > 0) {
      return `Thought for ${durationSeconds} sec.`;
    }
    return "Thought.";
  }

  const renderActionRow = (action: AgentMCPActionWithOutputType) => {
    const isActionRunning = !isToolExecutionStatusFinal(action.status);

    if (
      action.internalMCPServerName === "toolsets" &&
      action.toolName === TOOLSETS_ENABLE_TOOL_NAME
    ) {
      return (
        <ToolsetEnableInlineRow
          key={action.id}
          action={action}
          owner={owner}
          isRunning={isActionRunning}
          onLabelClick={openActionsPanel}
        />
      );
    }

    const actionChildren = (
      <MCPActionDetails
        displayContext="conversation"
        action={action}
        owner={owner}
        lastNotification={actionProgress.get(action.id)?.progress ?? null}
        messageStatus={agentMessage.status}
      />
    );

    return (
      <InlineActionRow
        key={action.id}
        label={getInlineActionLabel(action)}
        isRunning={isActionRunning}
        onLabelClick={openActionsPanel}
      >
        {actionChildren}
      </InlineActionRow>
    );
  };

  // Build rows: interleave completed thinking rows between step groups,
  // with a live "Thinking..." only after all existing actions.
  const rows: React.ReactNode[] = [];
  let prevStepEndMs = agentMessage.created;

  if (showThinkingRow && steps.length === 0) {
    // No actions yet — show live initial thinking.
    rows.push(
      <InlineActionRow
        key="thinking-initial"
        label="Thinking..."
        isRunning={true}
        onLabelClick={openActionsPanel}
      >
        {chainOfThought && (
          <Markdown
            content={chainOfThought}
            isStreaming={true}
            forcedTextSize="text-sm"
            textColor="text-muted-foreground"
            isLastMessage={false}
          />
        )}
      </InlineActionRow>
    );
  }

  for (const [step, stepActions] of steps) {
    const firstActionMs = stepActions[0].createdAt;

    // Thinking before this step — only show if we captured CoT content.
    if (sawThinking.current) {
      const savedContent = savedChainOfThoughtByStep.get(step) ?? null;
      if (savedContent) {
        rows.push(
          <InlineActionRow
            key={`thinking-${step}`}
            label={getCompletedThinkingLabel(prevStepEndMs, firstActionMs)}
            isRunning={false}
            onLabelClick={openActionsPanel}
            forceHasContent
          >
            <Markdown
              content={savedContent}
              isStreaming={false}
              forcedTextSize="text-sm"
              textColor="text-muted-foreground"
              isLastMessage={false}
            />
          </InlineActionRow>
        );
      }
    }

    for (const action of stepActions) {
      rows.push(renderActionRow(action));
    }

    prevStepEndMs = stepActions[stepActions.length - 1].createdAt;
  }

  // Live "Thinking..." only after all existing step groups.
  if (isThinking && hasActions) {
    rows.push(
      <InlineActionRow
        key="thinking-live"
        label="Thinking..."
        isRunning={true}
        onLabelClick={openActionsPanel}
      >
        {chainOfThought && (
          <Markdown
            content={chainOfThought}
            isStreaming={true}
            forcedTextSize="text-sm"
            textColor="text-muted-foreground"
            isLastMessage={false}
          />
        )}
      </InlineActionRow>
    );
  }

  if (imageGenActions.length > 1) {
    rows.push(
      <InlineActionRow
        key="image-gen-group"
        label={getInlineActionLabel(imageGenActions[0])}
        isRunning={imageGenActions.some(
          (a) => !isToolExecutionStatusFinal(a.status)
        )}
        onLabelClick={openActionsPanel}
      >
        <MCPImageGenerationGroupedDetails
          displayContext="conversation"
          actions={imageGenActions}
          owner={owner}
        />
      </InlineActionRow>
    );
  }

  return <div className="flex flex-col gap-y-1">{rows}</div>;
}
