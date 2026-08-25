import { UsageUpgradeButton } from "@app/components/credits/UsageUpgradeButton";
import { AwuUsageBar } from "@app/components/workspace/MembersUsageTable";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useMyUsage, useSeatPlan } from "@app/lib/swr/credits";
import { useWorkspaceUsageStatus } from "@app/lib/swr/user";
import { isCreditPricedPlan } from "@app/types/plan";
import { ordinalDay } from "@app/types/shared/utils/date_utils";
import type { WorkspaceType } from "@app/types/user";
import { Separator, Spinner, Stars02 } from "@dust-tt/sparkle";

interface PersonalUsageCardProps {
  owner: WorkspaceType;
  visible: boolean;
  onManagerNavigate?: () => void;
}

export function PersonalUsageCard({
  owner,
  visible,
  onManagerNavigate,
}: PersonalUsageCardProps) {
  const { isManager, subscription } = useAuth();
  const isCreditBased = isCreditPricedPlan(subscription.plan);
  const { myUsage, nextCreditResetAt, isMyUsageLoading } = useMyUsage({
    workspaceId: owner.sId,
    disabled: !isCreditBased || !visible,
  });
  const { seatPlans } = useSeatPlan({
    workspaceId: owner.sId,
    disabled: !isCreditBased || !visible,
  });
  const { hasPendingUpgradeRequest, requireReason } = useWorkspaceUsageStatus({
    owner,
    disabled: isManager || !isCreditBased || !visible,
  });

  if (!isCreditBased) {
    return null;
  }

  const seatName =
    (myUsage?.seatType ? seatPlans[myUsage.seatType]?.name : null) ??
    subscription.plan.name;
  const hasPersonalUsage =
    (myUsage?.spendLimitAwuCredits ?? myUsage?.memberUsageLimit ?? null) !==
    null;

  return (
    <section className="flex flex-col gap-2 rounded-lg bg-muted-background p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-highlight-100 outline outline-1 outline-highlight-500/20">
            <Stars02 className="h-3 w-3 text-highlight-500" />
          </span>
          <span className="text-base font-semibold text-foreground">
            {seatName}
          </span>
        </span>
        <UsageUpgradeButton
          owner={owner}
          hasPendingUpgradeRequest={hasPendingUpgradeRequest}
          variant="button"
          isManager={isManager}
          requireReason={requireReason}
          onManagerNavigate={onManagerNavigate}
        />
      </div>
      <Separator />
      {isMyUsageLoading ? (
        <div className="flex justify-center py-2">
          <Spinner size="sm" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {hasPersonalUsage ? (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  Your Credits
                </span>
                {nextCreditResetAt &&
                  myUsage?.seatType !== "free" &&
                  (() => {
                    const resetAt = new Date(nextCreditResetAt);
                    const month = resetAt.toLocaleDateString("en-US", {
                      month: "long",
                      timeZone: "UTC",
                    });
                    return (
                      <span className="text-xs text-muted-foreground">
                        Resets on {month} {ordinalDay(resetAt.getUTCDate())}
                      </span>
                    );
                  })()}
              </div>
              <AwuUsageBar
                consumed={myUsage?.consumedAwuCredits ?? 0}
                consumedFromAllowance={
                  myUsage?.consumedFromAllowanceAwuCredits ?? 0
                }
                consumedFromPool={myUsage?.consumedFromPoolAwuCredits ?? 0}
                memberUsageLimit={myUsage?.memberUsageLimit ?? null}
                seatBalanceAwu={myUsage?.seatBalanceAwu ?? null}
                effectiveLimit={myUsage?.spendLimitAwuCredits ?? 0}
                spendLimitSource={myUsage?.spendLimitSource ?? "none"}
                seatType={myUsage?.seatType ?? null}
                isTotalAllowedUsagePending={false}
              />
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
