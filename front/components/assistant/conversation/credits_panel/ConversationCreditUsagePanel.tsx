import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { ConversationCreditUsageBreakdown } from "@app/components/assistant/conversation/credits_panel/ConversationCreditUsageBreakdown";
import { useConversationConsumption } from "@app/hooks/conversations/useConversationConsumption";
import { formatCreditValue } from "@app/lib/client/credits";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { CoinsStacked01, Spinner } from "@dust-tt/sparkle";

interface ConversationCreditUsagePanelProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function ConversationCreditUsagePanel({
  conversation,
  owner,
}: ConversationCreditUsagePanelProps) {
  const { closePanel } = useConversationSidePanelContext();
  const { consumption, isConsumptionError, isConsumptionLoading } =
    useConversationConsumption({
      conversationId: conversation.sId,
      workspaceId: owner.sId,
    });
  const hasNoCreditUsage = !consumption || consumption.billedCredits <= 0;

  return (
    <div className="flex h-panel flex-col">
      <ConversationSidePanelHeader onClose={closePanel}>
        <span className="text-sm font-medium text-foreground">
          Conversation credits
        </span>
      </ConversationSidePanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isConsumptionLoading && !consumption ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : isConsumptionError ? (
          <div className="flex h-full items-center justify-center px-5 py-4">
            <p className="text-sm text-muted-foreground">
              Conversation credit usage couldn’t be loaded.
            </p>
          </div>
        ) : hasNoCreditUsage ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex w-full flex-col items-center justify-center gap-4 px-10">
              <CoinsStacked01
                aria-hidden="true"
                className="h-6 w-6 text-faint"
              />
              <div className="flex w-full flex-col items-center gap-1">
                <p className="text-center text-lg font-medium leading-6 text-foreground">
                  No usage yet
                </p>
                <p className="text-center text-sm font-medium leading-5 text-muted-foreground">
                  Updates once a message is fully processed.
                </p>
              </div>
            </div>
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
              <span className="text-lg font-semibold text-foreground">
                {formatCreditValue(consumption.billedCredits)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              The detailed breakdown isn’t available for this conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
