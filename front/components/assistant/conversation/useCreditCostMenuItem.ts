import { useAuth } from "@app/lib/auth/AuthContext";
import { formatCredits } from "@app/lib/client/credits";
import { isCreditPricedPlan } from "@app/types/plan";
import type { DropdownMenuItemProps } from "@dust-tt/sparkle";
import { ActionCreditCoinsIcon } from "@dust-tt/sparkle";

const CREDIT_COST_COPY = {
  conversation: {
    label: "Conversation credit cost",
    tooltip:
      "Total credits used for the conversation: intelligence, tools, and retries. Sub-agent costs are tracked separately.",
  },
  message: {
    label: "Message credit cost",
    tooltip:
      "Credits used for this message: intelligence, tools. Sub-agent costs are tracked separately. Retries are surfaced only in the total conversation cost.",
  },
};

interface UseCreditCostMenuItemProps {
  credits: number | null | undefined;
  scope: "conversation" | "message";
}

export function useCreditCostMenuItem({
  credits,
  scope,
}: UseCreditCostMenuItemProps): DropdownMenuItemProps | null {
  const { subscription } = useAuth();

  if (!isCreditPricedPlan(subscription.plan)) {
    return null;
  }

  if (credits == null || credits <= 0) {
    return null;
  }

  const { label, tooltip } = CREDIT_COST_COPY[scope];

  return {
    label,
    icon: ActionCreditCoinsIcon,
    endComponent: formatCredits(credits),
    tooltip,
    separatorAfter: true,
    className:
      "cursor-default font-normal text-muted-foreground hover:bg-transparent focus:bg-transparent dark:text-muted-foreground-night dark:hover:bg-transparent dark:focus:bg-transparent",
    onSelect: (e) => e.preventDefault(),
  };
}
