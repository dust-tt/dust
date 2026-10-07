import { isFreePlan } from "@app/lib/plans/plan_codes";
import { Chip } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useSubscriptionContext } from "./SubscriptionContext";

export type SubscriptionStatus = "free" | "active" | "cancelled" | "ended";

const STATUS_CHIP: Record<
  SubscriptionStatus,
  {
    label: MessageDescriptor;
    color: "success" | "highlight" | "info" | "warning";
  }
> = {
  free: { label: msg`Free`, color: "success" },
  active: { label: msg`Active`, color: "highlight" },
  cancelled: { label: msg`Cancelled`, color: "info" },
  ended: { label: msg`Ended`, color: "warning" },
};

export function SubscriptionStatusChip() {
  const { t } = useLingui();
  const { subscriptionStatus, subscription } = useSubscriptionContext();
  const status = isFreePlan(subscription.plan.code)
    ? "free"
    : subscriptionStatus;
  return (
    <Chip
      size="mini"
      color={STATUS_CHIP[status].color}
      label={t(STATUS_CHIP[status].label)}
    />
  );
}
