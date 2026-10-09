import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";
import { AlertCircle, Icon, Tooltip } from "@dust-tt/sparkle";

interface UsagePaceIconProps {
  usageTarget: CreditUsageTarget | null | undefined;
  // Without labels, the icon has no tooltip of its own.
  labels?: { elevated: string; critical: string };
}

export function UsagePaceIcon({ usageTarget, labels }: UsagePaceIconProps) {
  if (usageTarget !== "elevated" && usageTarget !== "critical") {
    return null;
  }
  const icon = (
    <Icon
      visual={AlertCircle}
      size="sm"
      className={
        usageTarget === "critical" ? "text-red-500" : "text-warning-500"
      }
    />
  );
  if (!labels) {
    return <span className="flex shrink-0 items-center">{icon}</span>;
  }
  return (
    <Tooltip
      tooltipTriggerAsChild
      label={labels[usageTarget]}
      trigger={
        <span className="flex cursor-default items-center justify-center">
          {icon}
        </span>
      }
    />
  );
}
