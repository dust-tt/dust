import { useAuth } from "@app/lib/auth/AuthContext";
import { formatCredits } from "@app/lib/client/credits";
import { isCreditPricedPlan } from "@app/types/plan";
import type { DropdownMenuItemProps } from "@dust-tt/sparkle";

const MESSAGE_TOOLTIP =
  "Credits used by this message itself: intelligence and tools.";
const SUB_AGENT_TOOLTIP =
  "Credits used by all sub-agents (run agent, handover) spawned by this message.";
const TOTAL_TOOLTIP = "Total credits: this message plus its sub-agents.";

// Non-interactive, muted styling shared by every credit-cost line.
const ITEM_CLASS_NAME =
  "cursor-default font-normal text-muted-foreground hover:bg-transparent focus:bg-transparent dark:text-muted-foreground-night dark:hover:bg-transparent dark:focus:bg-transparent";

function creditCostItem({
  label,
  credits,
  tooltip,
}: {
  label: string;
  credits: number;
  tooltip: string;
}): DropdownMenuItemProps {
  return {
    label,
    endComponent: formatCredits(credits),
    tooltip,
    className: ITEM_CLASS_NAME,
    onSelect: (e) => e.preventDefault(),
  };
}

interface UseCreditCostMenuItemsProps {
  credits: number | null | undefined;
  subAgentCredits: number | null | undefined;
}

/**
 * Builds the (non-interactive) credit-cost lines shown in the agent message
 * dropdown: the message's own cost and, when present, the aggregated sub-agent
 * cost plus a total. Returns an empty array when there is nothing to show or the
 * workspace is not on a credit-priced plan.
 */
export function useCreditCostMenuItems({
  credits,
  subAgentCredits,
}: UseCreditCostMenuItemsProps): DropdownMenuItemProps[] {
  const { subscription } = useAuth();

  if (!isCreditPricedPlan(subscription.plan)) {
    return [];
  }

  const ownCredits = credits ?? 0;
  const subCredits = subAgentCredits ?? 0;

  if (ownCredits <= 0 && subCredits <= 0) {
    return [];
  }

  const items: DropdownMenuItemProps[] = [];

  if (ownCredits > 0) {
    items.push(
      creditCostItem({
        label: "Message credit cost",
        credits: ownCredits,
        tooltip: MESSAGE_TOOLTIP,
      })
    );
  }

  if (subCredits > 0) {
    items.push(
      creditCostItem({
        label: "Sub-agent credit cost",
        credits: subCredits,
        tooltip: SUB_AGENT_TOOLTIP,
      })
    );

    // Only worth a total line when both parts contribute.
    if (ownCredits > 0) {
      items.push(
        creditCostItem({
          label: "Total credit cost",
          credits: ownCredits + subCredits,
          tooltip: TOTAL_TOOLTIP,
        })
      );
    }
  }

  return items;
}
