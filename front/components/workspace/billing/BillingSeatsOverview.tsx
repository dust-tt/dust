import {
  SEAT_TYPE_ICONS,
  seatTypeAvatarColors,
} from "@app/components/workspace/billing/seatTypeUtils";
import type { SeatTypeInfo } from "@app/lib/api/credits/seat_plan";
import { compareStrings } from "@app/lib/i18n/format";
import { useMembersSeats, useSeatPlan } from "@app/lib/swr/credits";
import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType, SEAT_TYPE_ORDER } from "@app/types/memberships";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar, Chip, Cube01, Icon, Spinner, User01 } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

function AwuCreditsLabel({
  credits,
  period,
}: {
  credits: number;
  period: SeatTypeInfo["awuCreditsPeriod"];
}): string {
  const { t } = useLingui();

  switch (period) {
    case "weekly":
      return t`${plural(credits, {
        one: "# credit per week",
        other: "# credits per week",
      })}`;
    case "monthly":
      return t`${plural(credits, {
        one: "# credit per month",
        other: "# credits per month",
      })}`;
    case "quarterly":
      return t`${plural(credits, {
        one: "# credit per quarter",
        other: "# credits per quarter",
      })}`;
    case "annual":
      return t`${plural(credits, {
        one: "# credit per year",
        other: "# credits per year",
      })}`;
    case "lifetime":
      return t`${plural(credits, {
        one: "# credit lifetime",
        other: "# credits lifetime",
      })}`;
  }
}

interface BillingSeatsOverviewProps {
  owner: LightWorkspaceType;
}

export function BillingSeatsOverview({ owner }: BillingSeatsOverviewProps) {
  const { t } = useLingui();
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
      compareStrings(a.seatType, b.seatType)
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {orderedPlansWithMembers.map(
        ({ seatType, plan, membersCount, unassignedCount }) => {
          if (membersCount === 0 && !unassignedCount) {
            return null;
          }
          const avatarColors = seatTypeAvatarColors(seatType);

          return (
            <div
              key={seatType}
              className="flex min-h-28 flex-col gap-4 rounded-lg bg-muted-background p-4"
            >
              <div className="flex justify-between">
                <div className="flex items-center gap-2">
                  <Avatar
                    icon={SEAT_TYPE_ICONS[seatType] ?? Cube01}
                    size="xs"
                    backgroundColor={avatarColors.backgroundColor}
                    iconColor={avatarColors.iconColor}
                  />
                  <div className="truncate text-base font-semibold text-foreground">
                    {plan.name.replace("Seat", "seat")}
                  </div>
                </div>
                {unassignedCount !== null && unassignedCount > 0 && (
                  <Chip
                    label={t`${plural(unassignedCount, {
                      one: "# available",
                      other: "# available",
                    })}`}
                    size="mini"
                    color="highlight"
                  />
                )}
              </div>

              <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Icon visual={User01} size="xs" />
                  <span>
                    {t`${plural(membersCount, {
                      one: "# seat assigned",
                      other: "# seats assigned",
                    })}`}
                  </span>
                </div>
                {plan.awuCredits > 0 && (
                  <div className="flex items-center gap-2">
                    <span>
                      <AwuCreditsLabel
                        credits={plan.awuCredits}
                        period={plan.awuCreditsPeriod}
                      />
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
