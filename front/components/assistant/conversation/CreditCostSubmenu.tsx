import { getActionStepIcon } from "@app/components/assistant/conversation/actions/inline/utils";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import { formatCredits } from "@app/lib/client/credits";
import type {
  AgentMessageConsumptionAttribution,
  AgentMessageConsumptionItem,
} from "@app/types/assistant/agent_message_consumption";
import {
  ChevronRight,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

const CREDIT_AMOUNT_MICRO_PER_CREDIT = 1_000_000;

type AttributionLine = {
  key: string;
  label: string;
  description?: string;
  creditAmountMicro: number;
  icon: ComponentType<{ className?: string }>;
  order: number;
  toolUseCount: number;
};

function formatAttributedCreditAmount(creditAmountMicro: number): string {
  const credits = creditAmountMicro / CREDIT_AMOUNT_MICRO_PER_CREDIT;
  return credits.toLocaleString("en-US", {
    maximumFractionDigits: credits < 0.1 ? 3 : 1,
  });
}

function formatCreditValue(credits: number): string {
  return `${formatCredits(credits)} credits`;
}

function getLineForItem(item: AgentMessageConsumptionItem): AttributionLine {
  if (item.itemType === "tool" && item.tool) {
    return {
      key: `tool:${item.tool.functionCallName}`,
      label: item.tool.displayName,
      creditAmountMicro: item.grossAttributedCreditAmountMicro,
      icon: getActionStepIcon(item.tool),
      order: 2,
      toolUseCount: 1,
    };
  }

  if (item.itemType === "output") {
    return {
      key: "response",
      label: "Writing the response",
      creditAmountMicro: item.grossAttributedCreditAmountMicro,
      icon: InternalActionIcons.ActionDocumentTextIcon,
      order: 3,
      toolUseCount: 0,
    };
  }

  if (item.itemType === "reasoning") {
    return {
      key: "reasoning",
      label: "Working through the task",
      creditAmountMicro: item.grossAttributedCreditAmountMicro,
      icon: InternalActionIcons.ActionBrainIcon,
      order: 1,
      toolUseCount: 0,
    };
  }

  return {
    key: "input",
    label: "Reading the request and conversation",
    creditAmountMicro: item.grossAttributedCreditAmountMicro,
    icon: InternalActionIcons.ActionMagnifyingGlassIcon,
    order: 0,
    toolUseCount: 0,
  };
}

function buildAttributionLines(
  attribution: AgentMessageConsumptionAttribution
): AttributionLine[] {
  const linesByKey = new Map<string, AttributionLine>();

  for (const item of attribution.items) {
    const line = getLineForItem(item);
    const existing = linesByKey.get(line.key);
    linesByKey.set(
      line.key,
      existing
        ? {
            ...existing,
            creditAmountMicro:
              existing.creditAmountMicro + line.creditAmountMicro,
            toolUseCount: existing.toolUseCount + line.toolUseCount,
          }
        : line
    );
  }

  return [...linesByKey.values()]
    .sort((left, right) => left.order - right.order)
    .map((line) => ({
      ...line,
      description:
        line.toolUseCount > 1 ? `${line.toolUseCount} uses` : undefined,
    }));
}

function ReadonlyCostItem({
  label,
  description,
  value,
  icon,
}: {
  label: string;
  description?: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <DropdownMenuItem
      aria-label={`${label}, ${description ? `${description}, ` : ""}${value}`}
      aria-disabled="true"
      label={label}
      description={description}
      icon={icon}
      endComponent={value}
      onSelect={(event) => event.preventDefault()}
      className="cursor-default font-normal text-muted-foreground"
    />
  );
}

function ReadonlyNotice({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <DropdownMenuItem
      aria-label={`${label}. ${description}`}
      aria-disabled="true"
      label={label}
      description={description}
      onSelect={(event) => event.preventDefault()}
      className="cursor-default font-normal text-muted-foreground"
    />
  );
}

export function CreditCostSubmenu({
  credits,
  subAgentCredits,
  attribution,
  isLoading,
}: {
  credits: number | null | undefined;
  subAgentCredits: number | null | undefined;
  attribution: AgentMessageConsumptionAttribution | null | undefined;
  isLoading: boolean;
}) {
  const ownCredits = credits ?? 0;
  const childCredits = subAgentCredits ?? 0;
  const totalCredits = ownCredits + childCredits;

  if (!isLoading && totalCredits <= 0) {
    return null;
  }

  const attributionLines = attribution
    ? buildAttributionLines(attribution)
    : [];
  const grossAttributedCredits = attribution
    ? attribution.grossAttributedCreditAmountMicro /
      CREDIT_AMOUNT_MICRO_PER_CREDIT
    : 0;
  const reusedWorkSavings = grossAttributedCredits - ownCredits;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex min-w-44 flex-1 items-center gap-2">
          <span className="flex-1">Credit cost</span>
          {isLoading ? (
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
            label="This response"
            value={isLoading ? "Updating" : formatCreditValue(ownCredits)}
          />
          {childCredits > 0 && (
            <ReadonlyCostItem
              label="Sub-agents"
              value={isLoading ? "Updating" : formatCreditValue(childCredits)}
            />
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel
            label={
              childCredits > 0
                ? "This response's estimated breakdown"
                : "Estimated breakdown"
            }
          />
          <ReadonlyNotice
            label="About this breakdown"
            description="These estimates explain the work behind the response. The charged total above is exact."
          />
          {isLoading && attribution === undefined ? (
            <div
              aria-busy="true"
              aria-live="polite"
              className="flex min-h-9 items-center px-2 py-1.5 text-sm text-muted-foreground"
            >
              <span className="flex-1">Loading estimated details</span>
              <span className="h-3 w-8 animate-pulse rounded bg-muted-foreground/20" />
            </div>
          ) : attribution ? (
            <>
              {attributionLines.map((line) => (
                <ReadonlyCostItem
                  key={line.key}
                  label={line.label}
                  description={line.description}
                  value={`${formatAttributedCreditAmount(line.creditAmountMicro)} credits`}
                  icon={line.icon}
                />
              ))}
              <DropdownMenuSeparator />
              <ReadonlyCostItem
                label="Estimated attributed work"
                value={formatCreditValue(grossAttributedCredits)}
              />
              {reusedWorkSavings > 0 && (
                <ReadonlyCostItem
                  label="Estimated savings from reuse"
                  value={formatCreditValue(reusedWorkSavings)}
                />
              )}
            </>
          ) : (
            <ReadonlyNotice
              label="Detailed explanation unavailable"
              description="The charged total above is exact."
            />
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
