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
  AlertCircle,
  ArrowUp,
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Page,
  PieChart01,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";

function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US");
}

const DEFAULT_PAGE_SIZE = 25;

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
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);

  // Members are sorted server-side; reset to the first page when the sort
  // changes so the user lands on the start of the new ordering.
  const handleSetSorting = useCallback((next: SortingState) => {
    setSorting(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const sort = sorting[0];
  const membersOrderColumn = sort?.id === "email" ? "email" : "name";
  const membersOrderDirection = sort?.desc ? "desc" : "asc";

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
      orderColumn: membersOrderColumn,
      orderDirection: membersOrderDirection,
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
            visual={PieChart01}
            className="text-muted-foreground dark:text-muted-foreground-night"
            size="lg"
          />
          <Page.H variant="h3">Usage</Page.H>
          <Page.P variant="secondary">
            Manage the usage of your Dust workspace
          </Page.P>
        </Page.Vertical>

        <Page.Vertical gap="xs" align="stretch">
          {isAwuPoolSummaryError && (
            <ContentMessage
              title="Failed to load Workspace Credits Pool"
              icon={AlertCircle}
              variant="warning"
            >
              An error occurred while loading your Workspace Credits Pool data.
              Please refresh the page or contact support if the issue persists.
            </ContentMessage>
          )}

          {isAwuPoolSummaryLoading && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}

          {!isAwuPoolSummaryLoading && !isAwuPoolSummaryError && (
            <>
              <div className="flex items-baseline gap-1">
                <span className="heading-mono-4xl text-foreground dark:text-foreground-night">
                  {formatCredits(totalConsumedCredits)}
                </span>
                <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
                  /{formatCredits(initialTotalCredits)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {overageCredits !== null && overageCredits > 0 && (
                  <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
                    {formatCredits(overageCredits)} overage credits
                  </span>
                )}
                {isEnterprise ? (
                  <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
                    Contact your Dust sales representative to buy credits
                  </span>
                ) : (
                  <Button
                    label="Top up"
                    icon={ArrowUp}
                    size="xs"
                    variant="ghost"
                    onClick={() => setShowBuyCreditDialog(true)}
                  />
                )}
              </div>
            </>
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
            sorting={sorting}
            setSorting={handleSetSorting}
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
