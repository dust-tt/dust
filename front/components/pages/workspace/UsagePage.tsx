import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { ConfirmContext } from "@app/components/Confirm";
import { InviteEmailButtonWithModal } from "@app/components/members/InviteEmailButtonWithModal";
import { BuyAwuCreditsDialog } from "@app/components/workspace/BuyAwuCreditsDialog";
import { ChangeSeatModal } from "@app/components/workspace/ChangeSeatModal";
import { EditSpendLimitModal } from "@app/components/workspace/EditSpendLimitModal";
import { MembersUsageTable } from "@app/components/workspace/MembersUsageTable";
import { UpgradeRequestsTable } from "@app/components/workspace/UpgradeRequestsTable";
import { LockedSection } from "@app/components/workspace/usage/LockedSection";
import { UsageNotificationsCard } from "@app/components/workspace/usage/UsageNotificationsCard";
import { UsageProgrammaticLimitCard } from "@app/components/workspace/usage/UsageProgrammaticLimitCard";
import { UsageSettingsCard } from "@app/components/workspace/usage/UsageSettingsCard";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { formatCredits } from "@app/lib/client/credits";
import {
  isEnterprisePlanPrefix,
  isFreePlan,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import {
  useAwuPoolSummary,
  useAwuPurchaseInfo,
  useCreditPurchaseInfo,
  useMyUsage,
  useSeatPlan,
} from "@app/lib/swr/credits";
import {
  useMembersUsage,
  useUpdateMemberSeatType,
} from "@app/lib/swr/memberships";
import {
  useResolveUpgradeRequest,
  useUpgradeRequests,
} from "@app/lib/swr/upgrade_requests";
import {
  useAwuUsage,
  usePerSeatPricing,
  useWorkspaceSeatAvailability,
} from "@app/lib/swr/workspaces";
import type {
  MembershipSeatType,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import {
  isMembershipSeatType,
  SEAT_TYPE_ORDER,
  toBaseSeatType,
} from "@app/types/memberships";
import { isCreditPricedPlan } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { isAdmin } from "@app/types/user";
import {
  AlertCircle,
  ArrowUp,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Page,
  PieChart01,
  SearchInput,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import capitalize from "lodash/capitalize";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

// Build a minimal member from an upgrade request to feed the reused seat / spend
// limit modals.
function memberFromUpgradeRequest(
  request: MembershipUpgradeRequestType
): MemberUsageType {
  return {
    sId: request.requester.sId,
    name: request.requester.name,
    email: request.requester.email,
    image: request.requester.image,
    seatType: request.requester.seatType,
    memberUsageLimit: null,
    seatBalanceAwu: null,
    consumedAwuCredits: 0,
    consumedFromAllowanceAwuCredits: 0,
    consumedFromPoolAwuCredits: 0,
    billingFrequency: null,
    nextCreditResetAt: null,
    scheduledSeatType: null,
    scheduledSeatChangeAt: null,
    spendLimitAwuCredits: null,
    spendLimitSource: "none",
    spendLimitAlertId: null,
    spendLimitWarningAlertId: null,
    freeCreditLowAlert: null,
    freeCreditEmptyAlert: null,
    creditState: "capped",
    nearLimit: false,
  };
}

const DEFAULT_PAGE_SIZE = 25;

function noOrFreeSeatTitle(seatType: "none" | "free"): string {
  switch (seatType) {
    case "none":
      return "You don't have a seat";
    case "free":
      return "You're on the Free seat";
    default:
      assertNeverAndIgnore(seatType);
      return "";
  }
}

function noOrFreeSeatBody(seatType: "none" | "free"): string {
  switch (seatType) {
    case "none":
      return "Assign yourself a seat to send messages.";
    case "free":
      return "The Free seat has limited usage. Upgrade your seat to get more credits.";
    default:
      assertNeverAndIgnore(seatType);
      return "";
  }
}

export function UsagePage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const router = useAppRouter();
  const { hasFeature } = useFeatureFlags();
  const isCreditPriced = isCreditPricedPlan(subscription.plan);
  // Legacy-contract workspaces can view this page in read-only mode behind a
  // flag: analytics and member spend render as usual, but every action (top up,
  // invite, seat changes, spend limits, settings) is disabled.
  const isReadOnly = !isCreditPriced && hasFeature("usage_page_read_only");
  const canViewUsage = isCreditPriced || isReadOnly;
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

  // The seat-type filter is applied server-side before pagination, so reset to
  // the first page whenever it changes to land on the start of the new set.
  const handleSetSeatTypeFilter = useCallback(
    (next: MembershipSeatType | "none" | null) => {
      setSeatTypeFilter(next);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    []
  );

  // Name/email search is also applied server-side before pagination, so reset
  // to the first page whenever the search term changes.
  const handleSetSearchTerm = useCallback((next: string) => {
    setSearchTerm(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const sort = sorting[0];
  const membersOrderColumn = sort?.id === "email" ? "email" : "name";
  const membersOrderDirection = sort?.desc ? "desc" : "asc";

  const { myUsage } = useMyUsage({ workspaceId: owner.sId });
  const openChangeMySeatParam = useSearchParam("openChangeMySeat");
  const [showBuyCreditDialog, setShowBuyCreditDialog] = useState(false);
  const [changeSeatMember, setChangeSeatMember] =
    useState<MemberUsageType | null>(null);

  const confirm = useContext(ConfirmContext);
  const { doUpdateSeatType } = useUpdateMemberSeatType({
    workspaceId: owner.sId,
  });
  const [seatChangePendingMemberIds, setSeatChangePendingMemberIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const handleSeatChangePendingChange = useCallback(
    (memberId: string, isPending: boolean) =>
      setSeatChangePendingMemberIds((prev) => {
        const next = new Set(prev);
        next[isPending ? "add" : "delete"](memberId);
        return next;
      }),
    []
  );
  const onRemoveSeat = useCallback(
    async (member: MemberUsageType) => {
      // Free seats carry no renewing allowance to preserve, so removing one is
      // immediate; paid seats keep access until the end of the current billing
      // period.
      const message =
        member.seatType === "free"
          ? `Are you sure you want to remove ${member.name}'s seat? They will immediately lose the ability to send messages, and the Free seat cannot be re-granted.`
          : `Are you sure you want to remove ${member.name}'s seat? They will keep access until the end of the current billing period, then lose the ability to send messages.`;
      const confirmed = await confirm({
        title: "Remove seat",
        message,
        validateLabel: "Remove seat",
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }
      handleSeatChangePendingChange(member.sId, true);
      try {
        await doUpdateSeatType({
          memberId: member.sId,
          memberName: member.name,
          seatType: "none",
          isCancellingScheduledChange: false,
          hasSeatPool: false,
        });
      } finally {
        handleSeatChangePendingChange(member.sId, false);
      }
    },
    [confirm, doUpdateSeatType, handleSeatChangePendingChange]
  );
  const [editSpendLimitMember, setEditSpendLimitMember] =
    useState<MemberUsageType | null>(null);
  const [
    totalAllowedUsagePendingMemberIds,
    setTotalAllowedUsagePendingMemberIds,
  ] = useState<ReadonlySet<string>>(() => new Set());
  const handleUsagePendingChange = useCallback(
    (memberId: string, isPending: boolean) =>
      setTotalAllowedUsagePendingMemberIds((prev) => {
        const next = new Set(prev);
        next[isPending ? "add" : "delete"](memberId);
        return next;
      }),
    []
  );
  // Admin-only Requests tab: pending member-initiated upgrade requests, resolved
  // by approving (via the seat / spend-limit modals) or denying.
  const isWorkspaceAdmin = isAdmin(owner);
  const [membersTab, setMembersTab] = useState<"members" | "requests">(
    "members"
  );
  const { upgradeRequests, isUpgradeRequestsLoading } = useUpgradeRequests({
    workspaceId: owner.sId,
    disabled: !isWorkspaceAdmin,
  });

  const filteredUpgradeRequests = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return upgradeRequests.filter((request) => {
      if (request.status !== "pending") {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const { name, email } = request.requester;
      return (
        name.toLowerCase().includes(normalizedSearch) ||
        (email?.toLowerCase().includes(normalizedSearch) ?? false)
      );
    });
  }, [upgradeRequests, searchTerm]);
  const { doResolveUpgradeRequest } = useResolveUpgradeRequest({
    workspaceId: owner.sId,
  });
  const [resolvingRequestIds, setResolvingRequestIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const setRequestResolving = useCallback(
    (requestId: string, isResolving: boolean) =>
      setResolvingRequestIds((prev) => {
        const next = new Set(prev);
        next[isResolving ? "add" : "delete"](requestId);
        return next;
      }),
    []
  );
  // When a seat / spend-limit modal was opened to resolve a request, this holds
  // the request to mark approved once the modal saves. Null when the modal was
  // opened from the members table.
  const [pendingApproveRequestId, setPendingApproveRequestId] = useState<
    string | null
  >(null);
  const handleChangeSeatFromTable = useCallback((member: MemberUsageType) => {
    setPendingApproveRequestId(null);
    setChangeSeatMember(member);
  }, []);
  const handleEditSpendLimitFromTable = useCallback(
    (member: MemberUsageType) => {
      setPendingApproveRequestId(null);
      setEditSpendLimitMember(member);
    },
    []
  );
  const handleUpgradePlanRequest = useCallback(
    (request: MembershipUpgradeRequestType) => {
      setPendingApproveRequestId(request.sId);
      setChangeSeatMember(memberFromUpgradeRequest(request));
    },
    []
  );
  const handleEditLimitRequest = useCallback(
    (request: MembershipUpgradeRequestType) => {
      setPendingApproveRequestId(request.sId);
      setEditSpendLimitMember(memberFromUpgradeRequest(request));
    },
    []
  );
  const handleApproveOnModalSaved = useCallback(() => {
    if (!pendingApproveRequestId) {
      return;
    }
    const requestId = pendingApproveRequestId;
    const request = upgradeRequests.find((r) => r.sId === requestId);
    setRequestResolving(requestId, true);
    void doResolveUpgradeRequest({
      requestId,
      requesterName: request?.requester.name ?? "Member",
      status: "approved",
    }).finally(() => setRequestResolving(requestId, false));
  }, [
    pendingApproveRequestId,
    upgradeRequests,
    doResolveUpgradeRequest,
    setRequestResolving,
  ]);
  const handleDenyRequest = useCallback(
    async (request: MembershipUpgradeRequestType) => {
      const confirmed = await confirm({
        title: "Deny upgrade request",
        message: `Deny ${request.requester.name}'s request to increase their spend limit?`,
        validateLabel: "Deny",
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }
      setRequestResolving(request.sId, true);
      try {
        await doResolveUpgradeRequest({
          requestId: request.sId,
          requesterName: request.requester.name,
          status: "denied",
        });
      } finally {
        setRequestResolving(request.sId, false);
      }
    },
    [confirm, doResolveUpgradeRequest, setRequestResolving]
  );

  const [inviteBlockedPopupReason, setInviteBlockedPopupReason] =
    useState<WorkspaceLimit | null>(null);
  useEffect(() => {
    if (!canViewUsage) {
      void router.push(`/w/${owner.sId}/members`);
    }
  }, [canViewUsage, router, owner.sId]);

  // Auto-open the "change my seat" modal when arriving from a blocked-state
  useEffect(() => {
    if (openChangeMySeatParam !== null && myUsage !== null) {
      setChangeSeatMember(myUsage);
    }
  }, [openChangeMySeatParam, myUsage]);

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

  const { billingCycleStartDay } = useCreditPurchaseInfo({
    workspaceId: owner.sId,
    disabled: !isReadOnly,
  });

  // Legacy contracts have no pool credits or commits, so the pool summary's
  // overage figure is meaningless. In read-only mode we instead show the
  // period's raw consumption from the AWU usage analytics endpoint (the same
  // data the chart below renders), summing its ungrouped "total" series for the
  // current billing cycle.
  const { awuUsageData } = useAwuUsage({
    workspaceId: owner.sId,
    billingCycleStartDay: billingCycleStartDay ?? 1,
    windowSize: "DAY",
    disabled: !isReadOnly,
  });
  const periodSpendCredits = useMemo(
    () =>
      (awuUsageData?.points ?? []).reduce(
        (sum, point) =>
          sum + point.groups.reduce((s, group) => s + group.valueCredits, 0),
        0
      ),
    [awuUsageData]
  );

  const { membersUsage, isMembersUsageLoading, totalMembersUsage } =
    useMembersUsage({
      workspaceId: owner.sId,
      searchTerm,
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
      orderColumn: membersOrderColumn,
      orderDirection: membersOrderDirection,
      seatType: seatTypeFilter ?? undefined,
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

  // Seat-type filter options derived from the seats available to this
  // workspace, collapsed to base tiers (monthly/yearly share one entry) and
  // ordered by tier.
  const seatFilterOptions = useMemo(() => {
    const currentBaseSeatTypes = new Set<MembershipSeatType>();
    for (const key of Object.keys(seatPlans)) {
      if (isMembershipSeatType(key)) {
        currentBaseSeatTypes.add(toBaseSeatType(key));
      }
    }
    return [...currentBaseSeatTypes].sort(
      (a, b) => SEAT_TYPE_ORDER[a] - SEAT_TYPE_ORDER[b]
    );
  }, [seatPlans]);

  const plan = subscription.plan;
  const isEnterprise = isEnterprisePlanPrefix(plan.code);
  const isFreePlanWorkspace = isFreePlan(plan.code);

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
  const hasPool = totalActiveCredits > 0;

  if (!canViewUsage) {
    return null;
  }

  const showPoolSection =
    !isAwuPoolSummaryLoading &&
    (!!isAwuPoolSummaryError || hasPool || isReadOnly);

  const searchAndInviteRow = (
    <div className="flex flex-row gap-2">
      <SearchInput
        placeholder="Search members"
        value={searchTerm}
        name="search"
        onChange={handleSetSearchTerm}
        className="w-full"
      />
      {isManualInvitationsEnabled && (
        <InviteEmailButtonWithModal
          owner={owner}
          prefillText=""
          perSeatPricing={perSeatPricing}
          onInviteClick={onInviteClick}
          disabled={isReadOnly}
          isFreePlan={isFreePlanWorkspace}
        />
      )}
    </div>
  );

  const seatFilterDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          label={
            seatTypeFilter === "none"
              ? "No seat"
              : seatTypeFilter
                ? capitalize(seatTypeFilter)
                : "All seats"
          }
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          label="All seats"
          onClick={() => handleSetSeatTypeFilter(null)}
        />
        <DropdownMenuItem
          label="No seat"
          onClick={() => handleSetSeatTypeFilter("none")}
        />
        {seatFilterOptions.map((seatType) => (
          <DropdownMenuItem
            key={seatType}
            label={capitalize(seatType)}
            onClick={() => handleSetSeatTypeFilter(seatType)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const membersTable = (
    <MembersUsageTable
      members={membersUsage}
      isLoading={isMembersUsageLoading}
      readOnly={isReadOnly}
      showSpendLimit={!isFreePlanWorkspace}
      totalAllowedUsagePendingMemberIds={totalAllowedUsagePendingMemberIds}
      seatChangePendingMemberIds={seatChangePendingMemberIds}
      isSeatBased={isSeatBased}
      onChangeSeat={handleChangeSeatFromTable}
      onRemoveSeat={onRemoveSeat}
      onEditSpendLimit={handleEditSpendLimitFromTable}
      pagination={pagination}
      setPagination={setPagination}
      totalRowCount={totalMembersUsage}
      sorting={sorting}
      setSorting={handleSetSorting}
    />
  );

  return (
    <>
      <BuyAwuCreditsDialog
        isOpen={showBuyCreditDialog}
        onClose={() => setShowBuyCreditDialog(false)}
        workspaceId={owner.sId}
        awuPurchaseInfo={awuPurchaseInfo}
        isAwuPurchaseInfoLoading={isAwuPurchaseInfoLoading}
        isAwuPurchaseInfoError={!!isAwuPurchaseInfoError}
        currentTotalPoolCredits={totalActiveCredits}
      />

      <div className="flex flex-col items-stretch gap-10 pb-20">
        <div className="flex items-center justify-between">
          <Page.Header title="Usage" icon={PieChart01} />
          {!isReadOnly && !isFreePlanWorkspace && !isEnterprise && (
            <Button
              label="Top up"
              icon={ArrowUp}
              size="sm"
              variant="outline"
              onClick={() => setShowBuyCreditDialog(true)}
            />
          )}
        </div>

        {!isReadOnly &&
          (myUsage?.seatType === "free" || myUsage?.seatType === "none") && (
            <ContentMessage
              title={noOrFreeSeatTitle(myUsage.seatType)}
              icon={AlertCircle}
              variant="blue"
            >
              <div className="flex items-center justify-between gap-4">
                <span>{noOrFreeSeatBody(myUsage.seatType)}</span>
                <Button
                  label="Change my seat"
                  variant="primary"
                  size="xs"
                  onClick={() => setChangeSeatMember(myUsage)}
                />
              </div>
            </ContentMessage>
          )}

        {showPoolSection && (
          <Page.Vertical gap="xs" align="stretch">
            <Page.H variant="h4">Workspace credit pool</Page.H>

            {isAwuPoolSummaryError && (
              <ContentMessage
                title="Failed to load Workspace Credits Pool"
                icon={AlertCircle}
                variant="warning"
              >
                An error occurred while loading your Workspace Credits Pool
                data. Please refresh the page or contact support if the issue
                persists.
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
                {hasPool && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/20">
                    <div
                      className="h-full rounded-full bg-foreground/80 transition-all"
                      style={{
                        width: `${Math.min(100, initialTotalCredits > 0 ? (totalConsumedCredits / initialTotalCredits) * 100 : 0)}%`,
                      }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {isReadOnly ? (
                    <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
                      {formatCredits(periodSpendCredits)} credits spent this
                      period
                    </span>
                  ) : (
                    <>
                      {overageCredits !== null && overageCredits > 0 && (
                        <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
                          {formatCredits(overageCredits)} overage credits
                        </span>
                      )}
                      {isEnterprise && (
                        <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
                          Contact your Dust sales representative to buy credits
                        </span>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </Page.Vertical>
        )}

        <Tabs defaultValue="members">
          <TabsList className="mb-4">
            <TabsTrigger value="members" label="Members" />
            <TabsTrigger value="settings" label="Settings" />
          </TabsList>

          <TabsContent value="members">
            <Page.Vertical gap="sm" align="stretch">
              {searchAndInviteRow}
              {isWorkspaceAdmin ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-row items-center justify-between gap-2">
                    <ButtonsSwitchList
                      size="xs"
                      defaultValue="members"
                      onValueChange={(v) =>
                        setMembersTab(v === "requests" ? "requests" : "members")
                      }
                    >
                      <ButtonsSwitch value="members" label="Members" />
                      <ButtonsSwitch
                        value="requests"
                        label="Requests"
                        isCounter
                        counterValue={
                          filteredUpgradeRequests.length > 0
                            ? String(filteredUpgradeRequests.length)
                            : undefined
                        }
                      />
                    </ButtonsSwitchList>
                    {membersTab === "members" && seatFilterDropdown}
                  </div>
                  <div className="pt-2">
                    {membersTab === "members" ? (
                      membersTable
                    ) : (
                      <UpgradeRequestsTable
                        requests={filteredUpgradeRequests}
                        isLoading={isUpgradeRequestsLoading}
                        seatPlans={seatPlans}
                        pendingRequestIds={resolvingRequestIds}
                        onUpgradePlan={handleUpgradePlanRequest}
                        onEditLimit={handleEditLimitRequest}
                        onDeny={handleDenyRequest}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {seatFilterDropdown && (
                    <div className="flex flex-row justify-end">
                      {seatFilterDropdown}
                    </div>
                  )}
                  {membersTable}
                </>
              )}
            </Page.Vertical>
          </TabsContent>

          <TabsContent value="settings">
            <div className="flex flex-col gap-10">
              <UsageSettingsCard
                workspaceId={owner.sId}
                readOnly={isReadOnly}
                hasPool={hasPool}
              />
              <LockedSection
                locked={!isAwuPoolSummaryLoading && !hasPool}
                className="flex flex-col gap-10"
              >
                <UsageProgrammaticLimitCard
                  workspaceId={owner.sId}
                  readOnly={isReadOnly}
                />
                <UsageNotificationsCard
                  workspaceId={owner.sId}
                  readOnly={isReadOnly}
                />
              </LockedSection>
            </div>
          </TabsContent>
        </Tabs>
      </div>

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
        onClose={() => {
          setChangeSeatMember(null);
          setPendingApproveRequestId(null);
        }}
        member={changeSeatMember}
        owner={owner}
        seatPlans={seatPlans}
        onSavingChange={handleSeatChangePendingChange}
        onSaved={handleApproveOnModalSaved}
      />

      <EditSpendLimitModal
        isOpen={editSpendLimitMember !== null}
        onClose={() => {
          setEditSpendLimitMember(null);
          setPendingApproveRequestId(null);
        }}
        member={editSpendLimitMember}
        owner={owner}
        onSavingChange={handleUsagePendingChange}
        onSaved={handleApproveOnModalSaved}
      />
    </>
  );
}
