import { formatCredits } from "@app/lib/client/credits";
import type { DropdownMenuItemProps } from "@dust-tt/sparkle";

const BEGINNING_AGENT_TOOLTIP =
  "Credits used for this message (tokens and actions).";

export const CREDIT_COST_ITEM_CLASS_NAME =
  "cursor-default font-normal text-muted-foreground hover:bg-transparent focus:bg-transparent";

interface UseCreditCostMenuItemProps {
  credits: number | null | undefined;
  subAgentCredits: number | null | undefined;
}

export function useCreditCostMenuItem({
  credits,
  subAgentCredits,
}: UseCreditCostMenuItemProps): DropdownMenuItemProps | null {
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
    label: "Message consumption",
    endComponent: formatCredits(totalCredits),
    tooltip,
    className: CREDIT_COST_ITEM_CLASS_NAME,
    onSelect: (e) => e.preventDefault(),
  };
}
