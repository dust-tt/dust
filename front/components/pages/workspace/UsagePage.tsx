import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { InviteEmailButtonWithModal } from "@app/components/members/InviteEmailButtonWithModal";
import { AwuUsageChart } from "@app/components/workspace/AwuUsageChart";
import { BuyAwuCreditsDialog } from "@app/components/workspace/BuyAwuCreditsDialog";
import { ChangeSeatModal } from "@app/components/workspace/ChangeSeatModal";
import { EditSpendLimitModal } from "@app/components/workspace/EditSpendLimitModal";
import { MembersUsageTable } from "@app/components/workspace/MembersUsageTable";
import { UsageNotificationsCard } from "@app/components/workspace/usage/UsageNotificationsCard";
import { UsageProgrammaticLimitCard } from "@app/components/workspace/usage/UsageProgrammaticLimitCard";
import { UsageSettingsCard } from "@app/components/workspace/usage/UsageSettingsCard";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { isEnterprisePlanPrefix, isUpgraded } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import {
  useAwuPoolSummary,
  useAwuPurchaseInfo,
  useCreditPurchaseInfo,
  useSeatPlan,
} from "@app/lib/swr/credits";
import { useMembersUsage } from "@app/lib/swr/memberships";
import {
  usePerSeatPricing,
  useWorkspaceSeatAvailability,
} from "@app/lib/swr/workspaces";
import type { MembershipSeatType } from "@app/types/memberships";
import { isCreditPricedPlan } from "@app/types/plan";
import { isAdmin } from "@app/types/user";
import {
  ActionCreditCoinsIcon,
  ActionPieChartIcon,
  ArrowUpIcon,
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ExclamationCircleIcon,
  Icon,
  Page,
  SearchInput,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";

function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US");
}

const DEFAULT_PAGE_SIZE = 25;

interface CreditPoolUsageBarProps {
  totalCredits: number;
  consumedCredits: number;
}

function CreditPoolUsageBar({
  totalCredits,
  consumedCredits,
}: CreditPoolUsageBarProps) {
  const consumedPercentage =
    totalCredits > 0
      ? Math.min((consumedCredits / totalCredits) * 100, 100)
      : 0;

  return (
    <Page.Vertical gap="xs" align="stretch">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted-foreground/10 dark:bg-muted-foreground-night/10"
        role="progressbar"
        aria-label="Workspace Credits Pool usage"
        aria-valuenow={Math.round(consumedPercentage)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <Tooltip
          tooltipTriggerAsChild
          label={`${formatCredits(consumedCredits)} credits consumed`}
          trigger={
            <div
              className="h-full shrink-0 bg-highlight transition-all dark:bg-highlight-night"
              style={{ width: `${consumedPercentage}%` }}
            />
          }
        />
      </div>
    </Page.Vertical>
  );
}

export function UsagePage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const router = useAppRouter();
  const isCreditPriced = isCreditPricedPlan(subscription.plan);
  const [searchTerm, setSearchTerm] = useState("");
  const [seatTypeFilter, setSeatTypeFilter] = useState<
    MembershipSeatType | "none" | null
  >(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const [showBuyCreditDialog, setShowBuyCreditDialog] = useState(false);
  const [changeSeatMember, setChangeSeatMember] =
    useState<MemberUsageType | null>(null);
  const [editSpendLimitMember, setEditSpendLimitMember] =
    useState<MemberUsageType | null>(null);
  const [inviteBlockedPopupReason, setInviteBlockedPopupReason] =
    useState<WorkspaceLimit | null>(null);
  useEffect(() => {
    if (!isCreditPriced) {
      void router.push(`/w/${owner.sId}/members`);
    }
  }, [isCreditPriced, router, owner.sId]);

  const {
    totalRemainingCredits,
    totalActiveCredits,
    overageCredits,
    isAwuPoolSummaryLoading,
    isAwuPoolSummaryError,
  } = useAwuPoolSummary({
    workspaceId: owner.sId,
  });

  const { awuPurchaseInfo, isAwuPurchaseInfoLoading, isAwuPurchaseInfoError } =
    useAwuPurchaseInfo({
      workspaceId: owner.sId,
      disabled: !showBuyCreditDialog,
    });

  const { billingCycleStartDay, isCreditPurchaseInfoLoading } =
    useCreditPurchaseInfo({
      workspaceId: owner.sId,
    });

  const { membersUsage, isMembersUsageLoading, totalMembersUsage } =
    useMembersUsage({
      workspaceId: owner.sId,
      searchTerm,
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
    });

  const { hasAvailableSeats } = useWorkspaceSeatAvailability({
    workspaceId: owner.sId,
  });

  const { seatPlans } = useSeatPlan({
    workspaceId: owner.sId,
  });

  const { perSeatPricing } = usePerSeatPricing({
    workspaceId: owner.sId,
  });

  const isSeatBased = Object.keys(seatPlans).length > 1;

  const plan = subscription.plan;
  const isEnterprise = isEnterprisePlanPrefix(plan.code);
  const isManualInvitationsEnabled =
    owner.metadata?.disableManualInvitations !== true;

  const onInviteClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!isUpgraded(plan)) {
        setInviteBlockedPopupReason("cant_invite_free_plan");
        event.preventDefault();
      } else if (subscription.paymentFailingSince) {
        setInviteBlockedPopupReason("cant_invite_payment_failure");
        event.preventDefault();
      } else if (!hasAvailableSeats) {
        setInviteBlockedPopupReason("cant_invite_no_seats_available");
        event.preventDefault();
      }
    },
    [plan, subscription.paymentFailingSince, hasAvailableSeats]
  );

  const totalConsumedCredits = Math.max(
    0,
    totalActiveCredits - totalRemainingCredits
  );
  const initialTotalCredits = totalActiveCredits;

  if (!isCreditPriced) {
    return null;
  }

  return (
    <>
      <BuyAwuCreditsDialog
        isOpen={showBuyCreditDialog}
        onClose={() => setShowBuyCreditDialog(false)}
        workspaceId={owner.sId}
        awuPurchaseInfo={awuPurchaseInfo}
        isAwuPurchaseInfoLoading={isAwuPurchaseInfoLoading}
        isAwuPurchaseInfoError={!!isAwuPurchaseInfoError}
        currentBalanceCredits={totalRemainingCredits}
      />

      <div className="flex flex-col items-stretch gap-10 pb-20">
        <Page.Vertical gap="xs">
          <Icon
            visual={ActionPieChartIcon}
            className="text-muted-foreground dark:text-muted-foreground-night"
            size="lg"
          />
          <Page.H variant="h3">Usage</Page.H>
          <Page.P variant="secondary">
            Manage the usage of your Dust workspace
          </Page.P>
        </Page.Vertical>

        <Page.Vertical gap="sm" align="stretch">
          <div className="flex items-center justify-between">
            <span className="text-[16px] font-medium leading-[24px] tracking-[-0.32px] text-foreground dark:text-foreground-night">
              Workspace Credits Pool
            </span>
            {!isAwuPoolSummaryLoading && (
              <div className="flex flex-col items-end gap-0.5">
                <span className="flex items-center gap-1.5 text-[18px] font-semibold leading-[26px] tracking-[-0.36px] text-foreground dark:text-foreground-night">
                  <Icon
                    visual={ActionCreditCoinsIcon}
                    size="sm"
                    className="text-muted-foreground dark:text-muted-foreground-night"
                  />
                  {formatCredits(totalConsumedCredits)} /{" "}
                  {formatCredits(initialTotalCredits)}
                </span>
                <div className="flex items-center gap-2">
                  {overageCredits !== null && overageCredits > 0 && (
                    <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                      {formatCredits(overageCredits)} overage credits.
                    </span>
                  )}
                  {isEnterprise ? (
                    <Tooltip
                      tooltipTriggerAsChild
                      label="Contact your Dust sales representative to top up."
                      trigger={
                        <button
                          className="flex items-center gap-1 text-xs font-medium text-highlight-500 opacity-50 dark:text-highlight-500-night"
                          disabled
                        >
                          <Icon visual={ArrowUpIcon} size="xs" />
                          Top up
                        </button>
                      }
                    />
                  ) : (
                    <button
                      className="flex cursor-pointer items-center gap-1 text-xs font-medium text-highlight-500 dark:text-highlight-500-night"
                      onClick={() => setShowBuyCreditDialog(true)}
                    >
                      <Icon visual={ArrowUpIcon} size="xs" />
                      Top up
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {isAwuPoolSummaryError && (
            <ContentMessage
              title="Failed to load Workspace Credits Pool"
              icon={ExclamationCircleIcon}
              variant="warning"
            >
              An error occurred while loading your Workspace Credits Pool data.
              Please refresh the page or contact support if the issue persists.
            </ContentMessage>
          )}

          {!isAwuPoolSummaryLoading && !isAwuPoolSummaryError && (
            <CreditPoolUsageBar
              totalCredits={initialTotalCredits}
              consumedCredits={totalConsumedCredits}
            />
          )}

          {isAwuPoolSummaryLoading && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
        </Page.Vertical>

        {isCreditPurchaseInfoLoading ? (
          <div className="h-64 animate-pulse rounded bg-muted-foreground/20" />
        ) : (
          <AwuUsageChart
            workspaceId={owner.sId}
            billingCycleStartDay={billingCycleStartDay ?? 1}
          />
        )}

        <UsageSettingsCard workspaceId={owner.sId} />

        <UsageProgrammaticLimitCard workspaceId={owner.sId} />

        <UsageNotificationsCard workspaceId={owner.sId} />

        <Page.Vertical gap="sm" align="stretch">
          <span className="heading-2xl text-foreground dark:text-foreground-night">
            Members
          </span>
          <div className="flex flex-row gap-2">
            <SearchInput
              placeholder="Search members"
              value={searchTerm}
              name="search"
              onChange={setSearchTerm}
              className="w-full"
            />
            {isManualInvitationsEnabled && (
              <InviteEmailButtonWithModal
                owner={owner}
                prefillText=""
                perSeatPricing={perSeatPricing}
                onInviteClick={onInviteClick}
              />
            )}
          </div>
          {isSeatBased && (
            <div className="flex flex-row justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    label={
                      seatTypeFilter === "none"
                        ? "No seat"
                        : seatTypeFilter
                          ? seatTypeFilter.charAt(0).toUpperCase() +
                            seatTypeFilter.slice(1)
                          : "All seats"
                    }
                    size="sm"
                    isSelect
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    label="All seats"
                    onClick={() => setSeatTypeFilter(null)}
                  />
                  <DropdownMenuItem
                    label="No seat"
                    onClick={() => setSeatTypeFilter("none")}
                  />
                  <DropdownMenuItem
                    label="Free"
                    onClick={() => setSeatTypeFilter("free")}
                  />
                  <DropdownMenuItem
                    label="Pro"
                    onClick={() => setSeatTypeFilter("pro")}
                  />
                  <DropdownMenuItem
                    label="Max"
                    onClick={() => setSeatTypeFilter("max")}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <MembersUsageTable
            members={membersUsage}
            isLoading={isMembersUsageLoading}
            seatTypeFilter={seatTypeFilter}
            isSeatBased={isSeatBased}
            onChangeSeat={setChangeSeatMember}
            onEditSpendLimit={setEditSpendLimitMember}
            pagination={pagination}
            setPagination={setPagination}
            totalRowCount={totalMembersUsage}
          />
        </Page.Vertical>

        {inviteBlockedPopupReason && (
          <ReachedLimitPopup
            isAdmin={isAdmin(owner)}
            isOpened={!!inviteBlockedPopupReason}
            onClose={() => setInviteBlockedPopupReason(null)}
            subscription={subscription}
            owner={owner}
            code={inviteBlockedPopupReason}
          />
        )}

        <ChangeSeatModal
          isOpen={changeSeatMember !== null}
          onClose={() => setChangeSeatMember(null)}
          member={changeSeatMember}
          owner={owner}
          seatPlans={seatPlans}
        />

        <EditSpendLimitModal
          isOpen={editSpendLimitMember !== null}
          onClose={() => setEditSpendLimitMember(null)}
          member={editSpendLimitMember}
          owner={owner}
        />
      </div>
    </>
  );
}
