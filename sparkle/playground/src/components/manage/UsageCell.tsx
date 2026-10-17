import { Robot, Tooltip, Zap } from "@dust-tt/sparkle";

import type { FleetUsage } from "../../data/fleetUsage";
import { USAGE_ORIGIN_LABELS } from "../../data/fleetUsage";
import { formatTimestampToFriendlyDate, pluralize } from "./utils";

function formatCount(count: number): string {
  return count.toLocaleString();
}

function lastUsedLabel(lastUsedAt: number | null, nowMs: number): string {
  if (lastUsedAt === null) {
    return "Never used";
  }
  const days = Math.floor((nowMs - lastUsedAt) / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    return "Last used today";
  }
  if (days === 1) {
    return "Last used yesterday";
  }
  if (days < 30) {
    return `Last used ${days} days ago`;
  }
  return `Last used ${formatTimestampToFriendlyDate(lastUsedAt, "compactWithDay")}`;
}

function usageTooltip(usage: FleetUsage, nowMs: number): string {
  const days = usage.timePeriodSec / (24 * 60 * 60);
  const lines = [
    `${formatCount(usage.human)} human message${pluralize(usage.human)} over the last ${days} days`,
  ];

  if (usage.programmatic > 0) {
    const origins = usage.programmaticOrigins
      .map((origin) => USAGE_ORIGIN_LABELS[origin])
      .join(", ");
    lines.push(
      `Also ${formatCount(usage.programmatic)} via ${origins || "API / integrations"}`
    );
  }

  if (usage.agentToAgent > 0) {
    lines.push(
      `Called ${formatCount(usage.agentToAgent)} time${pluralize(usage.agentToAgent)} by other agents — archiving it will break them`
    );
  }

  lines.push(lastUsedLabel(usage.lastUsedAt, nowMs));

  return lines.join("\n");
}

interface UsageCellProps {
  usage: FleetUsage | null;
  // System items are always active, so message usage does not apply to them.
  emptyTooltip?: string;
  nowMs: number;
  disabled?: boolean;
}

/**
 * One column: the human count is the number, everything automated sits behind
 * a muted secondary indicator. Raw totals would let a single API integration
 * make an otherwise unused agent look busy.
 */
export function UsageCell({
  usage,
  emptyTooltip,
  nowMs,
  disabled = false,
}: UsageCellProps) {
  if (!usage) {
    return (
      <Tooltip
        label={emptyTooltip ?? "Usage does not apply."}
        trigger={
          <span className="font-mono text-sm text-muted-foreground">-</span>
        }
      />
    );
  }

  const hasProgrammatic = usage.programmatic > 0;
  const hasAgentToAgent = usage.agentToAgent > 0;

  return (
    <Tooltip
      tooltipTriggerAsChild
      label={
        <span className="whitespace-pre-line">
          {usageTooltip(usage, nowMs)}
        </span>
      }
      trigger={
        <span
          className={
            disabled
              ? "flex cursor-not-allowed items-center gap-1.5 opacity-50"
              : "flex items-center gap-1.5"
          }
        >
          <span className="font-mono text-sm text-foreground tabular-nums">
            {formatCount(usage.human)}
          </span>
          {(hasProgrammatic || hasAgentToAgent) && (
            <span className="flex items-center gap-1 text-muted-foreground">
              {hasProgrammatic && (
                <span
                  className="inline-flex items-center gap-0.5"
                  aria-label={`${usage.programmatic} programmatic messages`}
                >
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                </span>
              )}
              {hasAgentToAgent && (
                <span
                  className="inline-flex items-center gap-0.5"
                  aria-label={`${usage.agentToAgent} calls from other agents`}
                >
                  <Robot className="h-3.5 w-3.5 shrink-0" />
                </span>
              )}
            </span>
          )}
        </span>
      }
    />
  );
}
