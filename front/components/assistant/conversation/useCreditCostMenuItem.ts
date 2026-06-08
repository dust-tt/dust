import { useAuth } from "@app/lib/auth/AuthContext";
import { formatCredits } from "@app/lib/client/credits";
import { isCreditPricedPlan } from "@app/types/plan";
import type { DropdownMenuItemProps } from "@dust-tt/sparkle";

const CREDIT_COST_COPY = {
  label: "Message credit cost",
  tooltip:
    "Credits used for this message: intelligence, tools. Sub-agent costs are tracked separately.",
};

interface UseCreditCostMenuItemProps {
  credits: number | null | undefined;
}

export function useCreditCostMenuItem({
  credits,
}: UseCreditCostMenuItemProps): DropdownMenuItemProps | null {
  const { subscription } = useAuth();

  if (!isCreditPricedPlan(subscription.plan)) {
    return null;
  }

  if (credits == null || credits <= 0) {
    return null;
  }

  return {
    label: CREDIT_COST_COPY.label,
    endComponent: formatCredits(credits),
    tooltip: CREDIT_COST_COPY.tooltip,
    className:
      "cursor-default font-normal text-muted-foreground hover:bg-transparent focus:bg-transparent dark:text-muted-foreground-night dark:hover:bg-transparent dark:focus:bg-transparent",
    onSelect: (e) => e.preventDefault(),
  };
}
