import type { SeatTypeInfo } from "@app/lib/api/credits/seat_plan";
import { useMembersSeats, useSeatPlan } from "@app/lib/swr/credits";
import {
  isMembershipSeatType,
  type MembershipSeatType,
} from "@app/types/memberships";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionCreditCoinsIcon,
  Avatar,
  Icon,
  SeatFreeIcon,
  SeatMaxIcon,
  SeatProIcon,
  Spinner,
  UserIcon,
} from "@dust-tt/sparkle";
import type React from "react";

interface BillingSeatsOverviewProps {
  owner: LightWorkspaceType;
}

const SEAT_TYPE_ORDER: Partial<Record<MembershipSeatType, number>> = {
  free: 0,
  pro: 1,
  max: 2,
};

const SEAT_TYPE_ICONS: Record<MembershipSeatType, React.ComponentType> = {
  free: SeatFreeIcon,
  workspace: SeatProIcon,
  workspace_yearly: SeatProIcon,
  pro: SeatProIcon,
  pro_yearly: SeatProIcon,
  max: SeatMaxIcon,
  max_yearly: SeatMaxIcon,
};

function seatTypeGroup(seatType: MembershipSeatType): MembershipSeatType {
  switch (seatType) {
    case "free":
    case "workspace":
    case "pro":
    case "max":
      return seatType;
    case "workspace_yearly":
      return "workspace";
    case "pro_yearly":
      return "pro";
    case "max_yearly":
      return "max";
    default:
      return assertNever(seatType);
  }
}

function yearlySeatTypeForGroup(
  seatType: MembershipSeatType
): MembershipSeatType | null {
  switch (seatType) {
    case "free":
    case "workspace_yearly":
    case "pro_yearly":
    case "max_yearly":
      return null;
    case "workspace":
      return "workspace_yearly";
    case "pro":
      return "pro_yearly";
    case "max":
      return "max_yearly";
    default:
      return assertNever(seatType);
  }
}

export function BillingSeatsOverview({ owner }: BillingSeatsOverviewProps) {
  const { seatPlans, isSeatPlanLoading } = useSeatPlan({
    workspaceId: owner.sId,
  });
  const { membersSeats, isMembersSeatsLoading } = useMembersSeats({
    workspaceId: owner.sId,
  });

  if (isSeatPlanLoading || isMembersSeatsLoading) {
    return (
      <div className="w-full p-6">
        <Spinner />
      </div>
    );
  }

  const plansBySeatType = new Map<
    MembershipSeatType,
    Partial<Record<SeatTypeInfo["billingFrequency"], SeatTypeInfo>>
  >();

  Object.entries(seatPlans).forEach(([seatType, plan]) => {
    if (!isMembershipSeatType(seatType) || !plan) {
      return;
    }

    const groupSeatType = seatTypeGroup(seatType);
    const plans = plansBySeatType.get(groupSeatType) ?? {};
    plans[plan.billingFrequency] = plan;
    plansBySeatType.set(groupSeatType, plans);
  });

  const plansWithMembers: Array<{
    seatType: MembershipSeatType;
    primaryPlan: SeatTypeInfo;
    membersCount: number;
  }> = Array.from(plansBySeatType.entries()).flatMap(([seatType, plans]) => {
    const primaryPlan = plans.monthly ?? plans.annual;
    if (!primaryPlan) {
      return [];
    }

    const yearlySeatType = yearlySeatTypeForGroup(seatType);
    const membersCount =
      (membersSeats[seatType] ?? 0) +
      (yearlySeatType ? (membersSeats[yearlySeatType] ?? 0) : 0);

    return [
      {
        seatType,
        primaryPlan,
        membersCount,
      },
    ];
  });

  if (plansWithMembers.length === 0) {
    return null;
  }

  const orderedPlansWithMembers = [...plansWithMembers].sort(
    (a, b) =>
      (SEAT_TYPE_ORDER[a.seatType] ?? Number.MAX_SAFE_INTEGER) -
        (SEAT_TYPE_ORDER[b.seatType] ?? Number.MAX_SAFE_INTEGER) ||
      a.seatType.localeCompare(b.seatType)
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {orderedPlansWithMembers.map(
        ({ seatType, primaryPlan, membersCount }) => (
          <div
            key={seatType}
            className="flex min-h-28 flex-col gap-4 rounded-lg bg-muted-background p-4 dark:bg-muted-background-night"
          >
            <div className="flex items-center gap-2">
              <Avatar
                icon={SEAT_TYPE_ICONS[seatType]}
                size="xs"
                backgroundColor={
                  seatType === "max" ? "s-bg-golden-100" : "s-bg-blue-100"
                }
                iconColor={
                  seatType === "max" ? "s-text-golden-600" : "s-text-blue-600"
                }
              />
              <div className="truncate text-base font-semibold text-foreground dark:text-foreground-night">
                {primaryPlan.name}
              </div>
            </div>

            <div className="flex flex-col gap-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
              <div className="flex items-center gap-2">
                <Icon visual={UserIcon} size="xs" />
                <span>
                  {membersCount.toLocaleString()}{" "}
                  {membersCount === 1 ? "seat assigned" : "seats assigned"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Icon visual={ActionCreditCoinsIcon} size="xs" />
                <span>
                  {primaryPlan.awuCredits.toLocaleString()} credits per month
                </span>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
