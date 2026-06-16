import { useAuth } from "@app/lib/auth/AuthContext";
import { formatCredits } from "@app/lib/client/credits";
import { isCreditPricedPlan } from "@app/types/plan";
import type { DropdownMenuItemProps } from "@dust-tt/sparkle";

const BEGINNING_AGENT_TOOLTIP =
  "Credits used for this message (intelligence and tools).";

const ITEM_CLASS_NAME =
  "cursor-default font-normal text-muted-foreground hover:bg-transparent focus:bg-transparent dark:text-muted-foreground-night dark:hover:bg-transparent dark:focus:bg-transparent";

interface UseCreditCostMenuItemProps {
  credits: number | null | undefined;
  subAgentCredits: number | null | undefined;
}

export function useCreditCostMenuItem({
  credits,
  subAgentCredits,
}: UseCreditCostMenuItemProps): DropdownMenuItemProps | null {
  const { subscription } = useAuth();

  if (!isCreditPricedPlan(subscription.plan)) {
    return null;
  }

  const ownCredits = credits ?? 0;
  const subCredits = subAgentCredits ?? 0;
  const totalCredits = ownCredits + subCredits;

  if (totalCredits <= 0) {
    return null;
  }

  const tooltip =
    BEGINNING_AGENT_TOOLTIP +
    (subCredits > 0
      ? `\nThis message: ${formatCredits(ownCredits)} credits.\nSub-agents: ${formatCredits(subCredits)} credits.`
      : "");

  return {
    label: "Credit cost",
    endComponent: formatCredits(totalCredits),
    tooltip,
    className: ITEM_CLASS_NAME,
    onSelect: (e) => e.preventDefault(),
  };
}
