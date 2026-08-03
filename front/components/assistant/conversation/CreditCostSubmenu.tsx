import { getActionStepIcon } from "@app/components/assistant/conversation/actions/inline/utils";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import { useAgentMessageConsumption } from "@app/hooks/conversations/useAgentMessageConsumption";
import { formatCredits } from "@app/lib/client/credits";
import type { AgentMessageConsumptionToolDetails } from "@app/types/assistant/agent_message_consumption";
import {
  ChevronRight,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  ShapesPlus,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";

const MAX_VISIBLE_TOOLS = 3;

function formatCreditValue(credits: number): string {
  return `${formatCredits(credits)} credits`;
}

function toolDescription(tool: AgentMessageConsumptionToolDetails): string {
  const descriptions = [
    `${tool.callCount} ${tool.callCount === 1 ? "use" : "uses"}`,
  ];

  if (tool.pending) {
    descriptions.push("Still running");
  }

  return descriptions.join(" · ");
}

interface ReadonlyCostItemProps {
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

function ReadonlyCostItem({
  description,
  icon,
  label,
  value,
}: ReadonlyCostItemProps) {
  return (
    <DropdownMenuItem
      aria-label={`${label}, ${description ? `${description}, ` : ""}${value}`}
      disabled
      label={label}
      description={description}
      icon={icon}
      endComponent={value}
      className="cursor-default font-normal text-foreground data-[disabled]:text-foreground"
    />
  );
}

interface ReadonlyNoticeProps {
  description: string;
  label: string;
}

function ReadonlyNotice({ description, label }: ReadonlyNoticeProps) {
  return (
    <DropdownMenuItem
      aria-label={`${label}. ${description}`}
      disabled
      label={label}
      description={description}
      className="cursor-default font-normal data-[disabled]:text-muted-foreground"
    />
  );
}

interface CreditCostSubmenuProps {
  conversationId: string;
  credits: number | null | undefined;
  isCostLoading: boolean;
  messageId: string;
  subAgentCredits: number | null | undefined;
  workspaceId: string;
}

// TODO(2026-08-03 OBSERVABILITY) Temporary component, design and implementation will be improved in the future.
export function CreditCostSubmenu({
  conversationId,
  credits,
  isCostLoading,
  messageId,
  subAgentCredits,
  workspaceId,
}: CreditCostSubmenuProps) {
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

  if (!isCostLoading && totalCredits <= 0) {
    return null;
  }

  const rankedTools = details
    ? [...details.tools].sort(
        (left, right) =>
          right.grossAttributedCredits - left.grossAttributedCredits
      )
    : [];
  const visibleTools = rankedTools.slice(0, MAX_VISIBLE_TOOLS);
  const remainingTools = rankedTools.slice(MAX_VISIBLE_TOOLS);
  const remainingToolCredits = remainingTools.reduce(
    (total, tool) => total + tool.grossAttributedCredits,
    0
  );
  const remainingToolCallCount = remainingTools.reduce(
    (total, tool) => total + tool.callCount,
    0
  );

  return (
    <DropdownMenuSub
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
      <DropdownMenuSubTrigger>
        <span className="flex min-w-44 flex-1 items-center gap-2">
          <span className="flex-1">Credit cost</span>
          {isCostLoading ? (
            <span className="h-3 w-8 animate-pulse rounded bg-muted-foreground/20" />
          ) : (
            <span className="font-normal text-muted-foreground">
              {formatCredits(totalCredits)}
            </span>
          )}
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-80">
          <DropdownMenuLabel label="Charged" />
          <ReadonlyCostItem
            label="This message"
            value={isCostLoading ? "Updating" : formatCreditValue(ownCredits)}
          />
          {childCredits > 0 && (
            <ReadonlyCostItem
              label="Sub-agents"
              value={
                isCostLoading ? "Updating" : formatCreditValue(childCredits)
              }
            />
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel label="Estimated work before savings" />
          {isConsumptionLoading && !consumption ? (
            <div
              aria-busy="true"
              aria-live="polite"
              className="flex min-h-9 items-center px-2 py-1.5 text-sm text-muted-foreground"
            >
              <span className="flex-1">Loading details</span>
              <span className="h-3 w-8 animate-pulse rounded bg-muted-foreground/20" />
            </div>
          ) : details ? (
            <>
              <ReadonlyCostItem
                label="Agent work and context"
                description="Longer conversations require more context to process"
                value={formatCreditValue(details.agentWorkCredits)}
                icon={InternalActionIcons.ActionBrainIcon}
              />
              {visibleTools.map((tool) => (
                <ReadonlyCostItem
                  key={`${tool.internalMCPServerName ?? "external"}:${tool.toolName}:${tool.label}`}
                  label={tool.label}
                  description={toolDescription(tool)}
                  value={formatCreditValue(tool.grossAttributedCredits)}
                  icon={getActionStepIcon(tool)}
                />
              ))}
              {remainingTools.length > 0 && (
                <ReadonlyCostItem
                  label="Other tools"
                  description={`${remainingTools.length} ${remainingTools.length === 1 ? "tool" : "tools"}, ${remainingToolCallCount} ${remainingToolCallCount === 1 ? "use" : "uses"}`}
                  value={formatCreditValue(remainingToolCredits)}
                  icon={ShapesPlus}
                />
              )}
              {details.estimatedCacheSavingsCredits !== null &&
                details.estimatedCacheSavingsCredits > 0 && (
                  <ReadonlyCostItem
                    label="Saved through reuse"
                    value={`−${formatCreditValue(details.estimatedCacheSavingsCredits)}`}
                  />
                )}
            </>
          ) : (
            <ReadonlyNotice
              label="Detailed explanation unavailable"
              description="The exact charge above is authoritative."
            />
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
