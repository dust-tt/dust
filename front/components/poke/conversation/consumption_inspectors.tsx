import { ConversationCreditUsageBreakdown } from "@app/components/assistant/conversation/credits_panel/ConversationCreditUsageBreakdown";
import { formatCreditValue } from "@app/lib/client/credits";
import { usePokeConversationConsumption } from "@app/poke/swr/conversation_consumption";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

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
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Includes completed messages and recursively spawned sub-agents.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isConsumptionLoading && <Spinner size="xs" />}
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
