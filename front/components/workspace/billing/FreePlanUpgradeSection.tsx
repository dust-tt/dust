import { Check, Icon } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

const UPGRADE_FEATURES = [
  "Invite members beyond the 5-seat cap",
  "Unlock Pro & Max seats",
  "Manage billing and roles in one place",
] as const;

interface FreePlanUpgradeSectionProps {
  action: ReactNode;
}

export function FreePlanUpgradeSection({
  action,
}: FreePlanUpgradeSectionProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted-background p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-highlight">
            Unlock the full workspace
          </span>
          <span className="text-base font-semibold text-foreground">
            One paid seat opens up the whole workspace
          </span>
        </div>
        {action}
      </div>

      <div className="flex flex-col gap-2">
        {UPGRADE_FEATURES.map((feature) => (
          <div key={feature} className="flex items-center gap-2">
            <Icon visual={Check} size="xs" className="text-highlight" />
            <span className="text-xs text-muted-foreground">{feature}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
