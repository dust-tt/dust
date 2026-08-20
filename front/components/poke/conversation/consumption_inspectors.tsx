import { ConversationCreditUsageBreakdown } from "@app/components/assistant/conversation/credits_panel/ConversationCreditUsageBreakdown";
import { MessageConsumptionBreakdown } from "@app/components/assistant/conversation/MessageConsumptionBreakdown";
import { formatCreditValue } from "@app/lib/client/credits";
import {
  usePokeAgentMessageConsumption,
  usePokeConversationConsumption,
} from "@app/poke/swr/conversation_consumption";
import type { PokeAgentMessageType } from "@app/types/poke";
import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface PokeMessageConsumptionInspectorProps {
  conversationId: string;
  message: PokeAgentMessageType;
  workspaceId: string;
}

export function PokeMessageConsumptionInspector({
  conversationId,
  message,
  workspaceId,
}: PokeMessageConsumptionInspectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { consumption, isConsumptionError, isConsumptionLoading } =
    usePokeAgentMessageConsumption({
      conversationId,
      disabled: !isOpen,
      messageId: message.sId,
      workspaceId,
    });

  const billedCredits = consumption?.billedCredits ?? message.costCredits ?? 0;
  const childCredits =
    consumption?.subAgentBilledCredits ?? message.subAgentCostCredits ?? 0;
  const totalCredits =
    consumption?.totalBilledCredits ?? billedCredits + childCredits;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="mt-2 rounded-md border border-separator bg-background"
    >
      <CollapsibleTrigger className="min-h-11 w-full justify-between gap-3 px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            Customer consumption breakdown
          </span>
          <Chip label="relational" size="mini" color="info" />
          {consumption?.details && (
            <Chip
              label={`attribution v${consumption.details.attributionVersion}`}
              size="mini"
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isConsumptionLoading && <Spinner size="xs" />}
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {formatCreditValue(totalCredits)}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent animated={false} className="border-t border-border">
        <div className="px-3 py-2">
          {isConsumptionError && (
            <p role="alert" className="mb-2 text-sm text-warning">
              The customer breakdown could not be loaded. The stored charge is
              shown as a fallback.
            </p>
          )}
          <MessageConsumptionBreakdown
            childCredits={childCredits}
            details={consumption?.details}
            isLoading={isConsumptionLoading && !consumption}
            totalCredits={totalCredits}
          />
          {consumption && (
            <div className="-mx-3 mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-3 pt-2 text-xs text-muted-foreground">
              <span>Direct message: {formatCreditValue(billedCredits)}</span>
              <span>Sub-agents: {formatCreditValue(childCredits)}</span>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface PokeConversationConsumptionInspectorProps {
  conversationId: string;
  workspaceId: string;
}

export function PokeConversationConsumptionInspector({
  conversationId,
  workspaceId,
}: PokeConversationConsumptionInspectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { consumption, isConsumptionError, isConsumptionLoading } =
    usePokeConversationConsumption({
      conversationId,
      disabled: !isOpen,
      workspaceId,
    });

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="overflow-hidden rounded-xl border border-border bg-background"
    >
      <CollapsibleTrigger className="min-h-11 w-full justify-between gap-3 px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-ring">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              Conversation consumption
            </span>
            <Chip label="customer calculation" size="mini" color="info" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Includes completed messages and recursively spawned sub-agents.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isConsumptionLoading && <Spinner size="xs" />}
          {consumption && (
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {formatCreditValue(consumption.billedCredits)}
            </span>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent animated={false} className="border-t border-border">
        {isConsumptionError ? (
          <p role="alert" className="px-4 py-6 text-sm text-warning">
            Conversation consumption could not be loaded.
          </p>
        ) : isConsumptionLoading && !consumption ? (
          <div className="flex min-h-32 items-center justify-center">
            <Spinner />
          </div>
        ) : !consumption || consumption.billedCredits <= 0 ? (
          <div className="px-4 py-6">
            <p className="text-sm font-medium text-foreground">
              No completed billed usage
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              In-progress messages are excluded until their charge is settled.
            </p>
          </div>
        ) : consumption.details ? (
          <ConversationCreditUsageBreakdown
            billedCredits={consumption.billedCredits}
            details={consumption.details}
          />
        ) : (
          <div className="space-y-2 px-4 py-6">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-muted-foreground">Total used</span>
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {formatCreditValue(consumption.billedCredits)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              The exact charge is available, but this conversation does not have
              a complete attribution breakdown.
            </p>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
