import { formatCredits } from "@app/lib/client/credits";
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
      "Credits used for this message: intelligence, tools, and retries. Sub-agent costs are tracked separately.",
  },
};

interface CreditCostMenuItemProps {
  credits: number | null | undefined;
  scope: "conversation" | "message";
}

// Informational, non-interactive dropdown row showing a credit cost. Renders
// nothing when there is no positive cost to display.
export function CreditCostMenuItem({
  credits,
  scope,
}: CreditCostMenuItemProps) {
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
