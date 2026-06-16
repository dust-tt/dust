import { isFreePlan } from "@app/lib/plans/plan_codes";
import { Chip } from "@dust-tt/sparkle";
import { useSubscriptionContext } from "./SubscriptionContext";

export type SubscriptionStatus = "free" | "active" | "cancelled" | "ended";

const STATUS_CHIP: Record<
  SubscriptionStatus,
  { label: string; color: "green" | "blue" | "golden" | "rose" }
> = {
  free: { label: "Free", color: "green" },
  active: { label: "Active", color: "blue" },
  cancelled: { label: "Cancelled", color: "golden" },
  ended: { label: "Ended", color: "rose" },
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
