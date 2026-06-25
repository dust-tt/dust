import type { LightWorkspaceType } from "@app/types/user";
import { Button, Check, Icon } from "@dust-tt/sparkle";

const UPGRADE_FEATURES = [
  "Invite members beyond the 5-seat cap",
  "Unlock Pro & Max seats",
  "Manage billing and roles in one place",
] as const;

interface FreePlanUpgradeSectionProps {
  owner: LightWorkspaceType;
}

export function FreePlanUpgradeSection({ owner }: FreePlanUpgradeSectionProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted-background p-4 dark:bg-muted-background-night">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-highlight">
            Unlock the full workspace
          </span>
          <span className="text-base font-semibold text-foreground dark:text-foreground-night">
            One paid seat opens up the whole workspace
          </span>
        </div>
        <Button
          label="Upgrade a member"
          size="sm"
          variant="highlight"
          href={`/w/${owner.sId}/usage`}
        />
      </div>

      <div className="flex flex-col gap-2">
        {UPGRADE_FEATURES.map((feature) => (
          <div key={feature} className="flex items-center gap-2">
            <Icon visual={Check} size="xs" className="text-highlight" />
            <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              {feature}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
