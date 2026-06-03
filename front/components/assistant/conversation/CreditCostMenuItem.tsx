import { useAuth } from "@app/lib/auth/AuthContext";
import { formatCredits } from "@app/lib/client/credits";
import { isCreditPricedPlan } from "@app/types/plan";
import {
  ActionCreditCoinsIcon,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Tooltip,
} from "@dust-tt/sparkle";

const CREDIT_COST_COPY = {
  conversation: {
    label: "Conversation credit cost",
    tooltip:
      "Total credits for the conversation: intelligence, tools, and retries. Sub-agent costs are tracked separately.",
  },
  message: {
    label: "Message credit cost",
    tooltip:
      "Credits used for this message: intelligence, tools. Sub-agent costs are tracked separately. Retries are surfaced only in the total conversation cost.",
  },
};

interface CreditCostMenuItemProps {
  credits: number | null | undefined;
  scope: "conversation" | "message";
}

// Informational, non-interactive dropdown row showing a credit cost. Renders
// nothing when the workspace plan is not credit-priced, or when there is no
// positive cost to display.
export function CreditCostMenuItem({
  credits,
  scope,
}: CreditCostMenuItemProps) {
  const { subscription } = useAuth();

  if (!isCreditPricedPlan(subscription.plan)) {
    return null;
  }

  if (credits == null || credits <= 0) {
    return null;
  }

  const { label, tooltip } = CREDIT_COST_COPY[scope];

  return (
    <>
      <Tooltip
        tooltipTriggerAsChild
        label={tooltip}
        trigger={
          <span className="block w-full">
            <DropdownMenuItem
              label={label}
              icon={ActionCreditCoinsIcon}
              endComponent={formatCredits(credits)}
              className="cursor-default font-normal text-muted-foreground hover:bg-transparent focus:bg-transparent dark:text-muted-foreground-night dark:hover:bg-transparent dark:focus:bg-transparent"
              onSelect={(e) => e.preventDefault()}
            />
          </span>
        }
      />
      <DropdownMenuSeparator />
    </>
  );
}
