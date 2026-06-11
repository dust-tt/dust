import {
  SEAT_TYPE_ICONS,
  seatTypeAvatarColors,
} from "@app/components/workspace/billing/seatTypeUtils";
import type { SeatTypeInfo } from "@app/lib/api/credits/seat_plan";
import { useMembersSeats, useSeatPlan } from "@app/lib/swr/credits";
import {
  isMembershipSeatType,
  type MembershipSeatType,
  SEAT_TYPE_ORDER,
} from "@app/types/memberships";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar, Chip, Cube01, Icon, Spinner, User01 } from "@dust-tt/sparkle";

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

  const plansWithMembers: Array<{
    seatType: MembershipSeatType;
    plan: SeatTypeInfo;
    membersCount: number;
    unassignedCount: number | null;
  }> = Object.entries(seatPlans).flatMap(([seatType, plan]) => {
    if (!isMembershipSeatType(seatType) || !plan) {
      return [];
    }

    const membersCount = membersSeats[seatType] ?? 0;
    const billed = metronomeSeats[seatType];

    return [
      {
        seatType,
        plan,
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {orderedPlansWithMembers.map(
        ({ seatType, plan, membersCount, unassignedCount }) => {
          const avatarColors = seatTypeAvatarColors(seatType);

          return (
            <div
              key={seatType}
              className="flex min-h-28 flex-col gap-4 rounded-lg bg-muted-background p-4 dark:bg-muted-background-night"
            >
              <div className="flex justify-between">
                <div className="flex items-center gap-2">
                  <Avatar
                    icon={SEAT_TYPE_ICONS[seatType] ?? Cube01}
                    size="xs"
                    backgroundColor={avatarColors.backgroundColor}
                    iconColor={avatarColors.iconColor}
                  />
                  <div className="truncate text-base font-semibold text-foreground dark:text-foreground-night">
                    {plan.name.replace("Seat", "seat")}
                  </div>
                </div>
                {unassignedCount !== null && unassignedCount > 0 && (
                  <Chip
                    label={`${unassignedCount.toLocaleString()} available`}
                    size="mini"
                    color="highlight"
                  />
                )}
              </div>

              <div className="flex flex-col gap-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
                <div className="flex items-center gap-2">
                  <Icon visual={User01} size="xs" />
                  <span>
                    {membersCount.toLocaleString()}{" "}
                    {membersCount === 1 ? "seat assigned" : "seats assigned"}
                  </span>
                </div>
                {plan.awuCredits > 0 && (
                  <div className="flex items-center gap-2">
                    <span>
                      {plan.awuCredits.toLocaleString()} credits{" "}
                      {formatAwuCreditsPeriod(plan.awuCreditsPeriod)}
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
