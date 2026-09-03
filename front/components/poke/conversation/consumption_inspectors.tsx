import { ConversationCreditUsageBreakdown } from "@app/components/assistant/conversation/credits_panel/ConversationCreditUsageBreakdown";
import { formatCreditValue } from "@app/lib/client/credits";
import { usePokeConversationConsumption } from "@app/poke/swr/conversation_consumption";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from "@dust-tt/sparkle";

interface PokeConversationConsumptionInspectorProps {
  conversationId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

export function PokeConversationConsumptionInspector({
  conversationId,
  isOpen,
  onOpenChange,
  workspaceId,
}: PokeConversationConsumptionInspectorProps) {
  const { consumption, isConsumptionError, isConsumptionLoading } =
    usePokeConversationConsumption({
      conversationId,
      disabled: !isOpen,
      workspaceId,
    });

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      className="overflow-hidden rounded-xl border border-border bg-background"
    >
      <CollapsibleTrigger className="min-h-11 w-full justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center">
            <span className="text-sm font-semibold text-foreground">
              Conversation consumption
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground xl:whitespace-nowrap">
            Includes completed messages and recursively spawned sub-agents.
          </p>
        </div>
        {isConsumptionLoading && <Spinner size="xs" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border">
        {isConsumptionError ? (
          <p role="alert" className="p-4 text-sm text-warning">
            Conversation consumption could not be loaded.
          </p>
        ) : isConsumptionLoading && !consumption ? (
          <div className="flex min-h-32 items-center justify-center">
            <Spinner />
          </div>
        ) : !consumption || consumption.billedCredits <= 0 ? (
          <div className="p-4">
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
          <div className="gap-2 p-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-muted-foreground">Total used</span>
              <span className="text-lg font-semibold text-foreground">
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
