import { Chip } from "@dust-tt/sparkle";
import { useSubscriptionContext } from "./SubscriptionContext";

export type SubscriptionStatus = "active" | "cancelled" | "ended";

const STATUS_CHIP: Record<
  SubscriptionStatus,
  { label: string; color: "blue" | "golden" | "rose" }
> = {
  active: { label: "Active", color: "blue" },
  cancelled: { label: "Cancelled", color: "golden" },
  ended: { label: "Ended", color: "rose" },
};

export function SubscriptionStatusChip() {
  const { subscriptionStatus } = useSubscriptionContext();
  return (
    <Chip
      size="mini"
      color={STATUS_CHIP[subscriptionStatus].color}
      label={STATUS_CHIP[subscriptionStatus].label}
    />
  );
}
