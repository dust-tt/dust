import { getActionStepIcon } from "@app/components/assistant/conversation/actions/inline/utils";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import { formatCreditValue, toolUsageLabel } from "@app/lib/client/credits";
import type {
  AgentMessageConsumptionDetails,
  AgentMessageConsumptionToolDetails,
} from "@app/types/assistant/agent_message_consumption";
import { Chip, Icon, Plus } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

const MAX_VISIBLE_TOOLS = 3;

function toolDescription(tool: AgentMessageConsumptionToolDetails): string {
  const descriptions = [toolUsageLabel(tool.callCount)];

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
    <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm">
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
      <dd className="shrink-0 text-muted-foreground">{value}</dd>
    </div>
  );
}

interface MessageConsumptionBreakdownProps {
  details: AgentMessageConsumptionDetails | null | undefined;
  headingId?: string;
  isLoading: boolean;
  totalCredits: number;
}

export function MessageConsumptionBreakdown({
  details,
  headingId,
  isLoading,
  totalCredits,
}: MessageConsumptionBreakdownProps) {
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
    <>
      <h2
        id={headingId}
        className="mb-1 text-sm font-semibold text-muted-foreground"
      >
        Message consumption
      </h2>
      <section aria-label="Charge summary">
        <dl>
          <CreditDetailRow
            label="Charged"
            value={formatCreditValue(totalCredits)}
          />
        </dl>
      </section>

      <hr className="-mx-3 border-t border-border" />

      <section aria-label="Consumption breakdown">
        {isLoading && !details ? (
          <div
            aria-busy="true"
            aria-live="polite"
            className="flex min-h-9 items-center text-sm text-muted-foreground"
          >
            <span className="flex-1">Loading details</span>
            <span className="h-3 w-8 animate-pulse rounded bg-muted-foreground/20" />
          </div>
        ) : details ? (
          <dl>
            <CreditDetailRow
              label="Context and reasoning"
              value={formatCreditValue(details.agentWorkCredits)}
              icon={InternalActionIcons.ActionBrainIcon}
            />
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
                description={toolUsageLabel(remainingToolCallCount)}
                value={formatCreditValue(remainingToolCredits)}
                icon={Plus}
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
    </>
  );
}
