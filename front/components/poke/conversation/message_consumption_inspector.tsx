import { getActionStepIcon } from "@app/components/assistant/conversation/actions/inline/utils";
import { getModelLogoByModelId } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { formatCreditValue, toolUsageLabel } from "@app/lib/client/credits";
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
  MOTION_DURATIONS,
  MOTION_EASINGS,
  ProgressBar,
  XClose,
} from "@dust-tt/sparkle";
import type { Variants } from "framer-motion";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";

const MESSAGE_PANEL_VARIANTS: Variants = {
  closed: {
    opacity: 0,
    scale: 0.985,
    x: -12,
    transition: {
      duration: MOTION_DURATIONS.modalExit,
      ease: MOTION_EASINGS.emphasized,
    },
  },
  open: {
    opacity: 1,
    scale: 1,
    x: 0,
    transition: {
      duration: MOTION_DURATIONS.modalEnter,
      ease: MOTION_EASINGS.emphasized,
    },
  },
};

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
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatCreditValue(model.attributedCredits)}
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
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted-background">
            <Icon
              visual={getActionStepIcon(tool)}
              size="xs"
              className="text-muted-foreground"
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium text-foreground">{tool.label}</p>
            <Chip size="mini" label={toolUsageLabel(tool.callCount)} />
            {tool.pending && (
              <Chip size="mini" color="warning" label="Pending" />
            )}
          </div>
        </div>
        <p className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {formatShare(tool.attributedCredits, totalCredits)}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
        <div>
          <dt className="text-xs text-muted-foreground">Tokens</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {formatCreditValue(tool.attributedCredits)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Direct tool charge</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {formatCreditValue(tool.directCredits)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

interface PokeMessageConsumptionInspectorProps {
  billedCredits: number | null;
  conversationId: string;
  isOpen: boolean;
  messageId: string;
  onOpenChange: (open: boolean) => void;
  onPanelRefChange: (element: HTMLDivElement | null) => void;
  subAgentBilledCredits: number | null | undefined;
  workspaceId: string;
}

export function PokeMessageConsumptionInspector({
  billedCredits,
  conversationId,
  isOpen,
  messageId,
  onOpenChange,
  onPanelRefChange,
  subAgentBilledCredits,
  workspaceId,
}: PokeMessageConsumptionInspectorProps) {
  const { isDark } = useTheme();
  const shouldReduceMotion = Boolean(useReducedMotion());
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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
  const triggerId = `message-${messageId}-consumption-trigger`;

  return (
    <div className="relative mt-3">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-controls={contentId}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Collapse" : "Expand"} consumption details for message ${messageId}`}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => onOpenChange(!isOpen)}
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
              {(!hasAuthoritativeBill || resolvedSubAgentBilledCredits > 0) && (
                <p className="truncate text-xs text-muted-foreground">
                  {hasAuthoritativeBill
                    ? `Includes ${formatCreditValue(resolvedSubAgentBilledCredits)} from sub-agents`
                    : "No authoritative charge recorded yet"}
                </p>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-semibold tabular-nums text-foreground">
              {hasAuthoritativeBill
                ? formatCreditValue(totalCredits)
                : "Not billed"}
            </p>
          </div>
        </div>
        <Icon
          visual={isOpen ? ChevronUp : ChevronDown}
          size="xs"
          className="shrink-0 text-muted-foreground"
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={contentId}
            role="region"
            aria-labelledby={triggerId}
            className="z-10 mt-3 rounded-xl border border-border bg-background shadow-xl xl:absolute xl:left-[calc(100%+1.5rem)] xl:top-0 xl:mt-0 xl:w-[var(--poke-inspector-width)]"
            style={{ transformOrigin: "left top" }}
            variants={MESSAGE_PANEL_VARIANTS}
            initial={shouldReduceMotion ? false : "closed"}
            animate="open"
            exit={shouldReduceMotion ? undefined : "closed"}
          >
            <div
              ref={onPanelRefChange}
              className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[inherit]"
              data-message-consumption-panel-id={messageId}
            >
              <div className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Message consumption
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {hasAuthoritativeBill
                      ? formatCreditValue(totalCredits)
                      : "Not billed"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Close consumption details for message ${messageId}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    onOpenChange(false);
                    triggerRef.current?.focus();
                  }}
                >
                  <Icon visual={XClose} size="xs" />
                </button>
              </div>
              <div className="bg-muted-background">
                {isConsumptionError ? (
                  <div className="p-4">
                    <p
                      role="alert"
                      className="text-sm font-medium text-warning"
                    >
                      Consumption details could not be loaded.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The amount shown above still comes from the authoritative
                      stored bill.
                    </p>
                  </div>
                ) : isConsumptionLoading && !consumption ? (
                  <div
                    aria-busy="true"
                    aria-label="Loading message consumption details"
                    className="p-4"
                  >
                    <LoadingBlock className="h-16 w-full rounded-xl" />
                  </div>
                ) : (
                  <div className="space-y-5 p-4">
                    {details ? (
                      <>
                        <section
                          aria-labelledby={`message-${messageId}-attribution-heading`}
                        >
                          <h3
                            id={`message-${messageId}-attribution-heading`}
                            className="text-sm font-semibold text-foreground"
                          >
                            Attribution
                          </h3>

                          {totalCredits > 0 && (
                            <div className="mt-4">
                              <ProgressBar
                                className="h-2 w-full bg-background"
                                values={[
                                  {
                                    value: details.agentWorkCredits,
                                    className: "bg-highlight-500",
                                  },
                                  {
                                    value: toolCredits,
                                    className: "bg-primary-400",
                                  },
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
                                    {formatCreditValue(
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
                                    {formatCreditValue(toolCredits)}{" "}
                                    <span className="font-normal text-muted-foreground">
                                      {formatShare(toolCredits, totalCredits)}
                                    </span>
                                  </dd>
                                </div>
                              </dl>
                              {!isReconciled &&
                                attributionDeltaCredits !== null && (
                                  <p className="mt-3 text-xs text-warning">
                                    Attribution differs from the authoritative
                                    bill by{" "}
                                    {formatCreditValue(attributionDeltaCredits)}
                                    .
                                  </p>
                                )}
                            </div>
                          )}
                        </section>

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

                        {details.models.length > 0 && (
                          <section
                            aria-labelledby={`message-${messageId}-models-heading`}
                            className="border-t border-border pt-5"
                          >
                            <h3
                              id={`message-${messageId}-models-heading`}
                              className="text-sm font-semibold text-foreground"
                            >
                              By model
                            </h3>
                            <ul className="mt-3 space-y-2">
                              {details.models.map((model) => (
                                <ModelRow
                                  key={`${model.providerId}:${model.modelId}`}
                                  directMessageCredits={
                                    directMessageCredits ?? 0
                                  }
                                  isDark={isDark}
                                  model={model}
                                />
                              ))}
                            </ul>
                          </section>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl border border-border bg-background p-3">
                        <p className="text-sm font-medium text-foreground">
                          Detailed attribution unavailable
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          The exact stored charge is available, but no complete
                          attribution version covers this message's runs and
                          tools.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
