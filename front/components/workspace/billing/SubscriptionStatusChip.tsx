import { isFreePlan } from "@app/lib/plans/plan_codes";
import { Chip } from "@dust-tt/sparkle";
import { useSubscriptionContext } from "./SubscriptionContext";

export type SubscriptionStatus = "free" | "active" | "cancelled" | "ended";

const STATUS_CHIP: Record<
  SubscriptionStatus,
  { label: string; color: "success" | "highlight" | "info" | "warning" }
> = {
  free: { label: "Free", color: "success" },
  active: { label: "Active", color: "highlight" },
  cancelled: { label: "Cancelled", color: "info" },
  ended: { label: "Ended", color: "warning" },
};

export function SubscriptionStatusChip() {
  const { subscriptionStatus, subscription } = useSubscriptionContext();
  const status = isFreePlan(subscription.plan.code)
    ? "free"
    : subscriptionStatus;
  return (
    <Chip
      size="mini"
      color={STATUS_CHIP[status].color}
      label={STATUS_CHIP[status].label}
    />
  );
}
