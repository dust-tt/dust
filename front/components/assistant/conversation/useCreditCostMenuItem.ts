import { useAuth } from "@app/lib/auth/AuthContext";
import { formatCredits } from "@app/lib/client/credits";
import { isCreditPricedPlan } from "@app/types/plan";
import type { DropdownMenuItemProps } from "@dust-tt/sparkle";

const BEGINNING_AGENT_TOOLTIP =
  "Credits used for this message (tokens and actions).";

export const CREDIT_COST_ITEM_CLASS_NAME =
  "cursor-default font-normal text-muted-foreground hover:bg-transparent focus:bg-transparent dark:text-muted-foreground-night dark:hover:bg-transparent dark:focus:bg-transparent";

interface UseCreditCostMenuItemProps {
  credits: number | null | undefined;
  subAgentCredits: number | null | undefined;
}

interface UseCreditCostMenuItemResult {
  creditCostItem: DropdownMenuItemProps | null;
  // Whether the current plan bills with credits. Gates whether the menu
  // section should be shown at all: on a credit-priced plan we keep it visible
  // (with a loader) while the cost is still being fetched.
  isCreditPriced: boolean;
}

export function useCreditCostMenuItem({
  credits,
  subAgentCredits,
}: UseCreditCostMenuItemProps): UseCreditCostMenuItemResult {
  const { subscription } = useAuth();

  if (!isCreditPricedPlan(subscription.plan)) {
    return { creditCostItem: null, isCreditPriced: false };
  }

  const ownCredits = credits ?? 0;
  const subCredits = subAgentCredits ?? 0;
  const totalCredits = ownCredits + subCredits;

  if (totalCredits <= 0) {
    return { creditCostItem: null, isCreditPriced: true };
  }

  const tooltip =
    BEGINNING_AGENT_TOOLTIP +
    (subCredits > 0
      ? `\nThis message: ${formatCredits(ownCredits)} credits.\nSub-agents: ${formatCredits(subCredits)} credits.`
      : "");

  return {
    creditCostItem: {
      label: "Credit cost",
      endComponent: formatCredits(totalCredits),
      tooltip,
      className: CREDIT_COST_ITEM_CLASS_NAME,
      onSelect: (e) => e.preventDefault(),
    },
    isCreditPriced: true,
  };
}
