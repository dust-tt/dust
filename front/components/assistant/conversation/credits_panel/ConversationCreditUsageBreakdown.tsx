import { getActionStepIcon } from "@app/components/assistant/conversation/actions/inline/utils";
import { getModelLogoByModelId } from "@app/components/providers/types";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  formatCredits,
  formatCreditValue,
  toolUsageLabel,
} from "@app/lib/client/credits";
import type {
  ConversationConsumptionAgentDetails,
  ConversationConsumptionDetails,
  ConversationConsumptionModelDetails,
  ConversationConsumptionToolDetails,
} from "@app/types/assistant/conversation_consumption";
import { pluralize } from "@app/types/shared/utils/string_utils";
import { Avatar, Chip, DustLogoSquare, Icon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

const MAX_VISIBLE_TOOLS = 3;

interface CreditBreakdownCardProps {
  description?: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  labelBadge?: string;
  value: number;
}

function CreditBreakdownCard({
  description,
  icon,
  label,
  labelBadge,
  value,
}: CreditBreakdownCardProps) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-2 rounded-xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <span className="line-clamp-2 text-xs font-semibold text-muted-foreground">
            {label}
          </span>
          {labelBadge && <Chip size="mini" label={labelBadge} />}
        </div>
        <Icon
          visual={icon}
          size="xs"
          className="shrink-0 text-muted-foreground"
        />
      </div>
      <div className="min-w-0">
        <p className="text-base font-semibold text-foreground">
          {formatCreditValue(value)}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

interface ToolBreakdownCardsProps {
  agentWorkCredits: number;
  tools: ConversationConsumptionToolDetails[];
}

function ToolBreakdownCards({
  agentWorkCredits,
  tools,
}: ToolBreakdownCardsProps) {
  const rankedTools = [...tools].sort(
    (left, right) => right.attributedCredits - left.attributedCredits
  );
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
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <CreditBreakdownCard
          label="Agent work and context"
          description="Longer conversations require more context to process"
          value={agentWorkCredits}
          icon={InternalActionIcons.ActionBrainIcon}
        />
      </div>
      {visibleTools.map((tool) => (
        <CreditBreakdownCard
          key={`${tool.internalMCPServerName ?? "external"}:${tool.toolName}:${tool.label}`}
          label={tool.label}
          description={toolUsageLabel(tool.callCount)}
          value={tool.attributedCredits}
          icon={getActionStepIcon(tool)}
        />
      ))}
      {remainingTools.length > 0 && (
        <CreditBreakdownCard
          label="Other tools"
          labelBadge={String(remainingTools.length)}
          description={toolUsageLabel(remainingToolCallCount)}
          value={remainingToolCredits}
          icon={InternalActionIcons.ToolsIcon}
        />
      )}
    </div>
  );
}

interface ModelRowProps {
  isDark: boolean;
  model: ConversationConsumptionModelDetails;
}

function ModelRow({ isDark, model }: ModelRowProps) {
  const modelIcon = getModelLogoByModelId(model.modelId, isDark);

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-background p-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted-background">
          <Icon visual={modelIcon ?? DustLogoSquare} size="xs" />
        </div>
        <span className="truncate text-base font-medium text-foreground">
          {model.displayName}
        </span>
      </div>
      <span className="shrink-0 text-base font-semibold text-muted-foreground">
        {formatCreditValue(model.attributedCredits)}
      </span>
    </div>
  );
}

interface ModelsBreakdownProps {
  isDark: boolean;
  models: ConversationConsumptionModelDetails[];
}

function ModelsBreakdown({ isDark, models }: ModelsBreakdownProps) {
  if (models.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground">Models</h3>
      <div className="space-y-2">
        {models.map((model) => (
          <ModelRow
            key={`${model.providerId}:${model.modelId}`}
            isDark={isDark}
            model={model}
          />
        ))}
      </div>
    </section>
  );
}

interface AgentBreakdownProps {
  agent: ConversationConsumptionAgentDetails;
}

function AgentBreakdown({ agent }: AgentBreakdownProps) {
  return (
    <section className="space-y-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar
            name={agent.name}
            visual={agent.pictureUrl ?? undefined}
            size="xs"
            isRounded
          />
          <h3 className="truncate text-base font-medium text-foreground">
            {agent.name}
          </h3>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatCreditValue(agent.billedCredits)}
        </span>
      </div>
      <ToolBreakdownCards
        agentWorkCredits={agent.agentWorkCredits}
        tools={agent.tools}
      />
    </section>
  );
}

interface ConversationCreditUsageBreakdownProps {
  billedCredits: number;
  details: ConversationConsumptionDetails;
}

export function ConversationCreditUsageBreakdown({
  billedCredits,
  details,
}: ConversationCreditUsageBreakdownProps) {
  const { isDark } = useTheme();

  return (
    <div className="space-y-6 px-4 py-6">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Total</h2>
          <div className="mt-1 flex items-end gap-1">
            <span className="text-2xl font-semibold leading-8 text-foreground">
              {formatCredits(billedCredits)}
            </span>
            <span className="pb-1 text-sm text-muted-foreground">
              credit{pluralize(billedCredits)}
            </span>
          </div>
        </div>
        <ToolBreakdownCards
          agentWorkCredits={details.agentWorkCredits}
          tools={details.tools}
        />
      </section>

      <ModelsBreakdown isDark={isDark} models={details.models} />

      {details.agents.length > 1 &&
        details.agents.map((agent) => (
          <AgentBreakdown key={agent.agentId} agent={agent} />
        ))}
    </div>
  );
}
