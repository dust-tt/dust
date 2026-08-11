import { getActionStepIcon } from "@app/components/assistant/conversation/actions/inline/utils";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import { useAgentMessageConsumption } from "@app/hooks/conversations/useAgentMessageConsumption";
import { formatCreditValue } from "@app/lib/client/credits";
import type { AgentMessageConsumptionToolDetails } from "@app/types/assistant/agent_message_consumption";
import {
  Chip,
  Icon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ComponentType, ReactElement } from "react";
import { useId, useState } from "react";

const MAX_VISIBLE_TOOLS = 3;

function toolDescription(tool: AgentMessageConsumptionToolDetails): string {
  const descriptions = [
    `${tool.callCount} ${tool.callCount === 1 ? "use" : "uses"}`,
  ];

  if (tool.pending) {
    descriptions.push("Still running");
  }

  return descriptions.join(" · ");
}

interface CreditDetailRowProps {
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

function CreditDetailRow({
  description,
  icon,
  label,
  value,
}: CreditDetailRowProps) {
  return (
    <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm">
      <dt className="flex min-w-0 items-center gap-2 font-medium text-foreground">
        {icon && (
          <Icon
            visual={icon}
            size="xs"
            className="shrink-0 text-muted-foreground"
          />
        )}
        <span className="truncate">{label}</span>
        {description && (
          <Chip
            size="mini"
            label={description}
            className="shrink-0 font-normal"
          />
        )}
      </dt>
      <dd className="shrink-0 tabular-nums text-muted-foreground">{value}</dd>
    </div>
  );
}

interface CreditCostPopoverProps {
  conversationId: string;
  credits: number | null | undefined;
  messageId: string;
  subAgentCredits: number | null | undefined;
  trigger: ReactElement;
  workspaceId: string;
}

export function CreditCostPopover({
  conversationId,
  credits,
  messageId,
  subAgentCredits,
  trigger,
  workspaceId,
}: CreditCostPopoverProps) {
  const headingId = useId();
  const [hasOpened, setHasOpened] = useState(false);
  const { consumption, isConsumptionLoading, mutateConsumption } =
    useAgentMessageConsumption({
      conversationId,
      workspaceId,
      messageId,
      disabled: !hasOpened,
    });

  const ownCredits = consumption?.billedCredits ?? credits ?? 0;
  const childCredits = subAgentCredits ?? 0;
  const totalCredits = ownCredits + childCredits;
  const details = consumption?.details;

  if (totalCredits <= 0) {
    return null;
  }

  const rankedTools = details
    ? [...details.tools].sort(
        (left, right) => right.attributedCredits - left.attributedCredits
      )
    : [];
  const visibleTools = rankedTools.slice(0, MAX_VISIBLE_TOOLS);
  const remainingTools = rankedTools.slice(MAX_VISIBLE_TOOLS);
  const remainingToolCredits = remainingTools.reduce(
    (total, tool) => total + tool.attributedCredits,
    0
  );
  const remainingToolCallCount = remainingTools.reduce(
    (total, tool) => total + tool.callCount,
    0
  );

  return (
    <PopoverRoot
      onOpenChange={(open) => {
        if (!open) {
          return;
        }
        if (hasOpened) {
          void mutateConsumption();
        } else {
          setHasOpened(true);
        }
      }}
    >
      <Tooltip
        label="View credit breakdown"
        tooltipTriggerAsChild
        trigger={<PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      />
      <PopoverContent
        role="dialog"
        aria-labelledby={headingId}
        align="start"
        className="w-[min(24rem,calc(100vw-1rem))] p-4"
        preventAutoFocusOnClose={false}
      >
        <h2
          id={headingId}
          className="mb-1 text-sm font-semibold text-muted-foreground"
        >
          Message credits
        </h2>
        <section aria-label="Charge summary">
          <dl>
            <CreditDetailRow
              label="Charged"
              value={formatCreditValue(totalCredits)}
            />
          </dl>
        </section>

        <hr className="-mx-4 border-t border-border" />

        <section aria-label="Credit breakdown">
          {isConsumptionLoading && !consumption ? (
            <div
              aria-busy="true"
              aria-live="polite"
              className="flex min-h-10 items-center text-sm text-muted-foreground"
            >
              <span className="flex-1">Loading details</span>
              <span className="h-3 w-8 animate-pulse rounded bg-muted-foreground/20" />
            </div>
          ) : details ? (
            <dl>
              <CreditDetailRow
                label="Agent work and context"
                value={formatCreditValue(details.agentWorkCredits)}
                icon={InternalActionIcons.ActionBrainIcon}
              />
              {childCredits > 0 && (
                <CreditDetailRow
                  label="Sub-agents"
                  value={formatCreditValue(childCredits)}
                  icon={InternalActionIcons.ActionRobotIcon}
                />
              )}
              {visibleTools.map((tool) => (
                <CreditDetailRow
                  key={`${tool.internalMCPServerName ?? "external"}:${tool.toolName}:${tool.label}`}
                  label={tool.label}
                  description={toolDescription(tool)}
                  value={formatCreditValue(tool.attributedCredits)}
                  icon={getActionStepIcon(tool)}
                />
              ))}
              {remainingTools.length > 0 && (
                <CreditDetailRow
                  label={`${remainingTools.length} other ${remainingTools.length === 1 ? "tool" : "tools"}`}
                  description={`${remainingToolCallCount} ${remainingToolCallCount === 1 ? "use" : "uses"}`}
                  value={formatCreditValue(remainingToolCredits)}
                  icon={InternalActionIcons.ToolsIcon}
                />
              )}
            </dl>
          ) : (
            <div className="py-2 text-sm">
              <p className="font-medium text-foreground">
                Detailed explanation unavailable
              </p>
              <p className="text-xs text-muted-foreground">
                The exact charge above is authoritative.
              </p>
            </div>
          )}
        </section>
      </PopoverContent>
    </PopoverRoot>
  );
}
