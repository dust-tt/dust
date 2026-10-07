import { Check, Icon } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

const UPGRADE_FEATURES: MessageDescriptor[] = [
  msg`Invite members beyond the 5-seat cap`,
  msg`Unlock Pro & Max seats`,
  msg`Manage billing and roles in one place`,
];

interface FreePlanUpgradeSectionProps {
  action: ReactNode;
}

export function FreePlanUpgradeSection({
  action,
}: FreePlanUpgradeSectionProps) {
  const { t } = useLingui();

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted-background p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-highlight">
            <Trans>Unlock the full workspace</Trans>
          </span>
          <span className="text-base font-semibold text-foreground">
            <Trans>One paid seat opens up the whole workspace</Trans>
          </span>
        </div>
        {action}
      </div>

      <div className="flex flex-col gap-2">
        {UPGRADE_FEATURES.map((feature) => (
          <div key={feature.id} className="flex items-center gap-2">
            <Icon visual={Check} size="xs" className="text-highlight" />
            <span className="text-xs text-muted-foreground">{t(feature)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
