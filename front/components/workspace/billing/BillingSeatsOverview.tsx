import type { SeatTypeInfo } from "@app/lib/api/credits/seat_plan";
import { useMembersSeats, useSeatPlan } from "@app/lib/swr/credits";
import {
  isMembershipSeatType,
  type MembershipSeatType,
  SEAT_TYPE_ORDER,
} from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Cube01,
  Hexagon01,
  Icon,
  SeatMax,
  Spinner,
  User01,
} from "@dust-tt/sparkle";
import type React from "react";

const SEAT_TYPE_ICONS: Record<string, React.ComponentType> = {
  free: Hexagon01,
  pro: Cube01,
  max: SeatMax,
};

function seatTypeAvatarColors(seatType: MembershipSeatType) {
  switch (seatType) {
    case "free":
      return {
        backgroundColor: "bg-gray-100",
        iconColor: "text-gray-600",
      };
    case "max":
      return {
        backgroundColor: "bg-golden-100",
        iconColor: "text-golden-600",
      };
    default:
      return {
        backgroundColor: "bg-blue-100",
        iconColor: "text-blue-600",
      };
  }
}

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
    case "none":
      return "none";
    default:
      assertNeverAndIgnore(seatType);
      return seatType;
  }
}

function formatAwuCreditsPeriod(period: SeatTypeInfo["awuCreditsPeriod"]) {
  switch (period) {
    case "weekly":
      return "per week";
    case "monthly":
      return "per month";
    case "quarterly":
      return "per quarter";
    case "annual":
      return "per year";
    case "lifetime":
      return "lifetime";
  }
}

interface BillingSeatsOverviewProps {
  owner: LightWorkspaceType;
}

export function BillingSeatsOverview({ owner }: BillingSeatsOverviewProps) {
  const { seatPlans, isSeatPlanLoading } = useSeatPlan({
    workspaceId: owner.sId,
  });
  const { membersSeats, metronomeSeats, isMembersSeatsLoading } =
    useMembersSeats({
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

  const membersCountBySeatType = new Map<MembershipSeatType, number>();

  Object.entries(membersSeats).forEach(([seatType, count]) => {
    if (!isMembershipSeatType(seatType)) {
      return;
    }

    const groupSeatType = seatTypeGroup(seatType);
    membersCountBySeatType.set(
      groupSeatType,
      (membersCountBySeatType.get(groupSeatType) ?? 0) + count
    );
  });

  // Total seats billed in Metronome per seat type (assigned + unassigned),
  // grouped the same way as the member counts. `undefined` for a group means
  // Metronome had nothing to report for it (so we hide the unassigned line).
  const metronomeBilledBySeatType = new Map<MembershipSeatType, number>();

  Object.entries(metronomeSeats).forEach(([seatType, billed]) => {
    if (!isMembershipSeatType(seatType) || billed === undefined) {
      return;
    }

    const groupSeatType = seatTypeGroup(seatType);
    metronomeBilledBySeatType.set(
      groupSeatType,
      (metronomeBilledBySeatType.get(groupSeatType) ?? 0) + billed
    );
  });

  const plansWithMembers: Array<{
    seatType: MembershipSeatType;
    primaryPlan: SeatTypeInfo;
    membersCount: number;
    unassignedCount: number | null;
  }> = Array.from(plansBySeatType.entries()).flatMap(([seatType, plans]) => {
    const primaryPlan = plans.monthly ?? plans.annual;
    if (!primaryPlan) {
      return [];
    }

    const membersCount = membersCountBySeatType.get(seatType) ?? 0;
    const billed = metronomeBilledBySeatType.get(seatType);

    return [
      {
        seatType,
        primaryPlan,
        membersCount,
        // Unassigned = billed seats not backed by a real member. Null when
        // Metronome had no figure for this seat type.
        unassignedCount:
          billed === undefined ? null : Math.max(0, billed - membersCount),
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
        ({ seatType, primaryPlan, membersCount, unassignedCount }) => {
          const avatarColors = seatTypeAvatarColors(seatType);

          return (
            <div
              key={seatType}
              className="flex min-h-28 flex-col gap-4 rounded-lg bg-muted-background p-4 dark:bg-muted-background-night"
            >
              <div className="flex items-center gap-2">
                <Avatar
                  icon={SEAT_TYPE_ICONS[seatType] ?? Cube01}
                  size="xs"
                  backgroundColor={avatarColors.backgroundColor}
                  iconColor={avatarColors.iconColor}
                />
                <div className="truncate text-base font-semibold text-foreground dark:text-foreground-night">
                  {primaryPlan.name.replace("Seat", "seat")}
                </div>
              </div>

              <div className="flex flex-col gap-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
                <div className="flex items-center gap-2">
                  <Icon visual={User01} size="xs" />
                  <span>
                    {membersCount.toLocaleString()}{" "}
                    {membersCount === 1 ? "seat assigned" : "seats assigned"}
                    {unassignedCount !== null && unassignedCount > 0
                      ? ` - ${unassignedCount.toLocaleString()} available`
                      : ""}
                  </span>
                </div>
                {primaryPlan.awuCredits > 0 && (
                  <div className="flex items-center gap-2">
                    <span>
                      {primaryPlan.awuCredits.toLocaleString()} credits{" "}
                      {formatAwuCreditsPeriod(primaryPlan.awuCreditsPeriod)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        }
      )}
    </div>
  );
}
