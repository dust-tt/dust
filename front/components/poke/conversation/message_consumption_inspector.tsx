import { getActionStepIcon } from "@app/components/assistant/conversation/actions/inline/utils";
import { getModelLogoByModelId } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  formatCreditsPrecise,
  formatCreditValue,
  toolUsageLabel,
} from "@app/lib/client/credits";
import { usePokeMessageConsumption } from "@app/poke/swr/message_consumption";
import type {
  AgentMessageConsumptionModelDetails,
  AgentMessageConsumptionToolDetails,
} from "@app/types/assistant/agent_message_consumption";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  ChevronDown,
  ChevronUp,
  Chip,
  CoinsStacked01,
  DustLogoSquare,
  Icon,
  LoadingBlock,
  ProgressBar,
} from "@dust-tt/sparkle";
import { useState } from "react";

function formatPreciseCreditValue(credits: number): string {
  return `${formatCreditsPrecise(credits)} credit${pluralize(credits)}`;
}

function formatShare(credits: number, totalCredits: number): string {
  if (totalCredits <= 0 || credits <= 0) {
    return "0%";
  }

  const percentage = (credits / totalCredits) * 100;
  if (percentage < 0.1) {
    return "<0.1%";
  }

  return `${percentage.toLocaleString("en-US", {
    maximumFractionDigits: 1,
  })}%`;
}

interface CreditMetricProps {
  description: string;
  label: string;
  value: number | null;
}

function CreditMetric({ description, label, value }: CreditMetricProps) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums text-foreground">
        {value === null ? "Not billed" : formatCreditValue(value)}
      </dd>
      <dd className="mt-1 text-xs text-muted-foreground">{description}</dd>
    </div>
  );
}

interface ModelRowProps {
  directMessageCredits: number;
  isDark: boolean;
  model: AgentMessageConsumptionModelDetails;
}

function ModelRow({ directMessageCredits, isDark, model }: ModelRowProps) {
  const modelIcon = getModelLogoByModelId(model.modelId, isDark);

  return (
    <li className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted-background">
          <Icon visual={modelIcon ?? DustLogoSquare} size="xs" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {model.displayName}
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {model.providerId} / {model.modelId}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatPreciseCreditValue(model.attributedCredits)}
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {formatShare(model.attributedCredits, directMessageCredits)} of direct
          message
        </p>
      </div>
    </li>
  );
}

interface ToolRowProps {
  tool: AgentMessageConsumptionToolDetails;
  totalCredits: number;
}

function ToolRow({ tool, totalCredits }: ToolRowProps) {
  return (
    <li className="rounded-xl border border-border bg-background p-3">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted-background">
            <Icon
              visual={getActionStepIcon(tool)}
              size="xs"
              className="text-muted-foreground"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-medium text-foreground">
                {tool.label}
              </p>
              <Chip size="mini" label={toolUsageLabel(tool.callCount)} />
              {tool.pending && (
                <Chip size="mini" color="warning" label="Pending" />
              )}
            </div>
            <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
              {tool.internalMCPServerName ?? "external"} / {tool.toolName}
            </p>
          </div>
        </div>
        <p className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {formatShare(tool.attributedCredits, totalCredits)}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
        <div>
          <dt className="text-xs text-muted-foreground">Attributed</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {formatPreciseCreditValue(tool.attributedCredits)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Direct tool charge</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {formatPreciseCreditValue(tool.directCredits)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

interface PokeMessageConsumptionInspectorProps {
  billedCredits: number | null;
  conversationId: string;
  messageId: string;
  subAgentBilledCredits: number | null | undefined;
  workspaceId: string;
}

export function PokeMessageConsumptionInspector({
  billedCredits,
  conversationId,
  messageId,
  subAgentBilledCredits,
  workspaceId,
}: PokeMessageConsumptionInspectorProps) {
  const { isDark } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const { consumption, isConsumptionError, isConsumptionLoading } =
    usePokeMessageConsumption({
      conversationId,
      disabled: !isOpen,
      messageId,
      workspaceId,
    });

  const storedSubAgentBilledCredits = subAgentBilledCredits ?? 0;
  const storedTotalCredits = (billedCredits ?? 0) + storedSubAgentBilledCredits;
  const directMessageCredits = consumption?.billedCredits ?? billedCredits;
  const totalCredits = consumption?.totalBilledCredits ?? storedTotalCredits;
  const resolvedSubAgentBilledCredits = Math.max(
    0,
    totalCredits - (directMessageCredits ?? 0)
  );
  const hasAuthoritativeBill =
    directMessageCredits !== null || resolvedSubAgentBilledCredits > 0;
  const details = consumption?.details;
  const rankedTools = details
    ? [...details.tools].sort(
        (left, right) => right.attributedCredits - left.attributedCredits
      )
    : [];
  const toolCredits = rankedTools.reduce(
    (total, tool) => total + tool.attributedCredits,
    0
  );
  const explainedCredits = details
    ? details.agentWorkCredits + toolCredits
    : null;
  const attributionDeltaCredits =
    explainedCredits === null ? null : totalCredits - explainedCredits;
  const isReconciled =
    attributionDeltaCredits !== null &&
    Math.abs(attributionDeltaCredits) < 0.000001;

  const contentId = `message-${messageId}-consumption-details`;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-background">
      <button
        type="button"
        aria-controls={contentId}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Collapse" : "Expand"} consumption details for message ${messageId}`}
        className="flex min-h-11 w-full items-center justify-between gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={() => setIsOpen((open) => !open)}
      >
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-highlight-50">
              <Icon
                visual={CoinsStacked01}
                size="xs"
                className="text-highlight-600"
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Message consumption
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {hasAuthoritativeBill
                  ? resolvedSubAgentBilledCredits > 0
                    ? `Includes ${formatCreditValue(resolvedSubAgentBilledCredits)} from sub-agents`
                    : "Authoritative message charge"
                  : "No authoritative charge recorded yet"}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-semibold tabular-nums text-foreground">
              {hasAuthoritativeBill
                ? formatCreditValue(totalCredits)
                : "Not billed"}
            </p>
            {details && (
              <p className="text-xs text-muted-foreground">
                Attribution v{details.attributionVersion}
              </p>
            )}
          </div>
        </div>
        <Icon
          visual={isOpen ? ChevronUp : ChevronDown}
          size="xs"
          className="shrink-0 text-muted-foreground"
        />
      </button>

      {isOpen && (
        <div
          id={contentId}
          className="border-t border-border bg-muted-background"
        >
          {isConsumptionError ? (
            <div className="p-4">
              <p role="alert" className="text-sm font-medium text-warning">
                Consumption details could not be loaded.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The amount shown above still comes from the authoritative stored
                bill.
              </p>
            </div>
          ) : isConsumptionLoading && !consumption ? (
            <div
              aria-busy="true"
              aria-label="Loading message consumption details"
              className="space-y-3 p-4"
            >
              <LoadingBlock className="h-16 w-full rounded-xl" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <LoadingBlock className="h-20 w-full rounded-xl" />
                <LoadingBlock className="h-20 w-full rounded-xl" />
                <LoadingBlock className="h-20 w-full rounded-xl" />
              </div>
            </div>
          ) : (
            <div className="space-y-5 p-4">
              <section aria-labelledby={`message-${messageId}-bill-heading`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3
                      id={`message-${messageId}-bill-heading`}
                      className="text-sm font-semibold text-foreground"
                    >
                      Authoritative bill
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Stored charge for this message and its recursive sub-agent
                      tree.
                    </p>
                  </div>
                  <p className="text-2xl font-semibold leading-8 tabular-nums text-foreground">
                    {hasAuthoritativeBill
                      ? formatCreditValue(totalCredits)
                      : "Not billed"}
                  </p>
                </div>

                <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <CreditMetric
                    label="Direct message"
                    value={directMessageCredits}
                    description="Credits billed on this message."
                  />
                  <CreditMetric
                    label="Sub-agent tree"
                    value={resolvedSubAgentBilledCredits}
                    description="Recursive bill attributed to run-agent tools."
                  />
                  <CreditMetric
                    label="Explained"
                    value={explainedCredits}
                    description="Additive attribution available below."
                  />
                </dl>
              </section>

              {details ? (
                <>
                  <section
                    aria-labelledby={`message-${messageId}-attribution-heading`}
                    className="border-t border-border pt-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3
                          id={`message-${messageId}-attribution-heading`}
                          className="text-sm font-semibold text-foreground"
                        >
                          Additive attribution
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Reconciled shares of the exact bill.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          v{details.attributionVersion}
                        </span>
                        {isReconciled ? (
                          <Chip
                            size="mini"
                            color="success"
                            label="Reconciled"
                          />
                        ) : (
                          <Chip size="mini" color="warning" label="Gap" />
                        )}
                      </div>
                    </div>

                    {totalCredits > 0 && (
                      <div className="mt-4">
                        <ProgressBar
                          className="h-2 w-full bg-background"
                          values={[
                            {
                              value: details.agentWorkCredits,
                              className: "bg-highlight-500",
                            },
                            { value: toolCredits, className: "bg-primary-400" },
                          ]}
                          radius="xs"
                          label="Message credits split between agent work and tools"
                        />
                        <dl className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="size-2 rounded-full bg-highlight-500" />
                              Context and reasoning
                            </dt>
                            <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                              {formatPreciseCreditValue(
                                details.agentWorkCredits
                              )}{" "}
                              <span className="font-normal text-muted-foreground">
                                {formatShare(
                                  details.agentWorkCredits,
                                  totalCredits
                                )}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="size-2 rounded-full bg-primary-400" />
                              Tools
                            </dt>
                            <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                              {formatPreciseCreditValue(toolCredits)}{" "}
                              <span className="font-normal text-muted-foreground">
                                {formatShare(toolCredits, totalCredits)}
                              </span>
                            </dd>
                          </div>
                        </dl>
                        {!isReconciled && attributionDeltaCredits !== null && (
                          <p className="mt-3 text-xs text-warning">
                            Attribution differs from the authoritative bill by{" "}
                            {formatPreciseCreditValue(attributionDeltaCredits)}.
                          </p>
                        )}
                      </div>
                    )}
                  </section>

                  {details.models.length > 0 && (
                    <section
                      aria-labelledby={`message-${messageId}-models-heading`}
                      className="border-t border-border pt-5"
                    >
                      <h3
                        id={`message-${messageId}-models-heading`}
                        className="text-sm font-semibold text-foreground"
                      >
                        Direct message by model
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Provider and model mix for the originating message.
                      </p>
                      <ul className="mt-3 space-y-2">
                        {details.models.map((model) => (
                          <ModelRow
                            key={`${model.providerId}:${model.modelId}`}
                            directMessageCredits={directMessageCredits ?? 0}
                            isDark={isDark}
                            model={model}
                          />
                        ))}
                      </ul>
                    </section>
                  )}

                  {rankedTools.length > 0 && (
                    <section
                      aria-labelledby={`message-${messageId}-tools-heading`}
                      className="border-t border-border pt-5"
                    >
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div>
                          <h3
                            id={`message-${messageId}-tools-heading`}
                            className="text-sm font-semibold text-foreground"
                          >
                            Tools
                          </h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Every tool, ranked by its share of the bill.
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {rankedTools.length} tool
                          {pluralize(rankedTools.length)} ·{" "}
                          {toolUsageLabel(
                            rankedTools.reduce(
                              (total, tool) => total + tool.callCount,
                              0
                            )
                          )}
                        </p>
                      </div>
                      <ul className="mt-3 space-y-2">
                        {rankedTools.map((tool) => (
                          <ToolRow
                            key={`${tool.internalMCPServerName ?? "external"}:${tool.toolName}:${tool.label}`}
                            tool={tool}
                            totalCredits={totalCredits}
                          />
                        ))}
                      </ul>
                    </section>
                  )}

                  <p className="border-t border-border pt-4 text-xs text-muted-foreground">
                    Attributed credits reconcile the stored bill through model
                    input. Direct tool charge is the tool's own rate-card
                    charge; the attributed amount also includes the model
                    footprint and, for run-agent tools, the recursive sub-agent
                    bill.
                  </p>
                </>
              ) : (
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="text-sm font-medium text-foreground">
                    Detailed attribution unavailable
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The exact stored charge is available, but no complete
                    attribution version covers this message's runs and tools.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
