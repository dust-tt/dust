import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { ConfirmContext } from "@app/components/Confirm";
import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { InviteEmailButtonWithModal } from "@app/components/members/InviteEmailButtonWithModal";
import { BulkChangeSeatModal } from "@app/components/workspace/BulkChangeSeatModal";
import { BulkEditSpendLimitModal } from "@app/components/workspace/BulkEditSpendLimitModal";
import { BuyAwuCreditsDialog } from "@app/components/workspace/BuyAwuCreditsDialog";
import { FreePlanUpgradeSection } from "@app/components/workspace/billing/FreePlanUpgradeSection";
import {
  SEAT_TYPE_ICONS,
  seatTypeDisplayName,
} from "@app/components/workspace/billing/seatTypeUtils";
import { ChangeSeatModal } from "@app/components/workspace/ChangeSeatModal";
import { EditSpendLimitModal } from "@app/components/workspace/EditSpendLimitModal";
import { GroupModelTierPickerDropdown } from "@app/components/workspace/GroupModelTierPickerDropdown";
import { GroupsUsageTable } from "@app/components/workspace/GroupsUsageTable";
import { MembersSelectionBanner } from "@app/components/workspace/MembersSelectionBanner";
import { MembersUsageTable } from "@app/components/workspace/MembersUsageTable";
import { getSeatIconColorClass } from "@app/components/workspace/seat_styles";
import { TopUpsHistoryTable } from "@app/components/workspace/TopUpsHistoryTable";
import { UpgradeRequestsTable } from "@app/components/workspace/UpgradeRequestsTable";
import { LockedSection } from "@app/components/workspace/usage/LockedSection";
import { ModelTiersSettingsCard } from "@app/components/workspace/usage/ModelTiersSettingsCard";
import { UsageNotificationsCard } from "@app/components/workspace/usage/UsageNotificationsCard";
import { UsageProgrammaticLimitCard } from "@app/components/workspace/usage/UsageProgrammaticLimitCard";
import { UsageSettingsCard } from "@app/components/workspace/usage/UsageSettingsCard";
import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import { useTableRowsSelection } from "@app/hooks/useTableRowsSelection";
import {
  cycleElapsedPercent,
  DEFAULT_CONSUMPTION_PERIOD,
  formatConsumptionDate,
} from "@app/lib/analytics/consumption_period";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { formatCredits } from "@app/lib/client/credits";
import type { UserModelTierSelection } from "@app/lib/client/model_tier_options";
import { INHERIT_MODEL_TIER } from "@app/lib/client/model_tier_options";
import {
  buildModelTierDefinitionByName,
  expandMaxTierName,
} from "@app/lib/client/model_tiers";
import { DEFAULT_MAX_MODEL_TIER } from "@app/lib/model_tiers/tier_order";
import {
  isCreditPricedFreePlan,
  isEnterprisePlanPrefix,
  isFreePlan,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { useSearchParam } from "@app/lib/platform";
import {
  useAwuPoolSummary,
  useAwuPurchaseInfo,
  useMyUsage,
  useSeatPlan,
} from "@app/lib/swr/credits";
import { useGroups } from "@app/lib/swr/groups";
import type { BulkMemberSelectionBody } from "@app/lib/swr/memberships";
import {
  useBulkChangeSeatType,
  useBulkSeatChangePreview,
  useBulkSetUserSpendLimit,
  useMembersUsage,
  useUpdateMemberSeatType,
} from "@app/lib/swr/memberships";
import {
  useGroupAllowedModelTiers,
  useModelTiers,
  useUserAllowedModelTierMutations,
  useUserAllowedModelTiers,
  useWorkspaceAllowedModelTiers,
} from "@app/lib/swr/model_tiers";
import {
  useResolveUpgradeRequest,
  useUpgradeRequests,
} from "@app/lib/swr/upgrade_requests";
import { useUsageSettings } from "@app/lib/swr/usage_settings";
import {
  usePerSeatPricing,
  useWorkspaceSeatAvailability,
} from "@app/lib/swr/workspaces";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type {
  MembershipSeatType,
  MembershipUpgradeRequestType,
  PaidSeatType,
} from "@app/types/memberships";
import {
  isMembershipSeatType,
  SEAT_TYPE_ORDER,
  toBaseSeatType,
} from "@app/types/memberships";
import {
  isCreditPricedPlan,
  isSubscriptionCancellationScheduled,
} from "@app/types/plan";
import { isAdmin } from "@app/types/user";
import {
  AlertCircle,
  ArrowUp,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Chip,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  LinkExternal01,
  LoadingBlock,
  Page,
  ProgressBar,
  SearchInput,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { PaginationState, SortingState } from "@tanstack/react-table";
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
    groups: [],
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
    rateLimiterSpendAwuCredits: null,
    metronomeConsumedAwuCredits: null,
    spendLimitSource: "none",
    spendLimitGroupName: null,
    spendLimitAlertId: null,
    spendLimitWarningAlertId: null,
    freeCreditLowAlert: null,
    freeCreditEmptyAlert: null,
    creditState: "on_pool",
    rateLimiterState: null,
    // Synthesized from a capped user's upgrade request.
    isSpendCapped: true,
    seatUsageTarget: null,
    overallUsageTarget: null,
  };
}

interface CreditPoolProgressBarProps {
  projectedPercentage: number;
  target: "on_target" | "off_target" | null;
  usedPercentage: number;
}

function CreditPoolProgressBar({
  projectedPercentage,
  target,
  usedPercentage,
}: CreditPoolProgressBarProps) {
  const clampedUsedPercentage = Math.min(Math.max(usedPercentage, 0), 100);
  const clampedProjectedPercentage = Math.min(
    Math.max(projectedPercentage, clampedUsedPercentage),
    100
  );
  const projectedRemainderPercentage =
    clampedProjectedPercentage - clampedUsedPercentage;
  const unusedPercentage = 100 - clampedProjectedPercentage;

  return (
    <ProgressBar
      aria-label="Workspace credit usage"
      aria-valuenow={clampedUsedPercentage}
      className="h-2 w-full bg-background"
      values={[
        {
          value: clampedUsedPercentage,
          className:
            target === "off_target" ? "bg-warning-500" : "bg-highlight-500",
        },
        {
          value: projectedRemainderPercentage,
          className:
            target === "off_target" ? "bg-warning-100" : "bg-highlight-100",
        },
        {
          value: unusedPercentage,
          className: "bg-muted-background",
        },
      ]}
      radius="xs"
    />
  );
}

const DEFAULT_PAGE_SIZE = 25;

export function UsagePage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const isCreditPriced = isCreditPricedPlan(subscription.plan);
  // Workspaces off a credit plan see this page without the credit pool, seat
  // and credits columns, spend limits and upgrade requests. Credit actions (top
  // up, invite, seat changes) are disabled for them; model tiers stay editable.
  // A cancelled subscription already has its end date scheduled with
  // Metronome; scheduling a seat change on top of it can land past that end
  // date and get rejected. Block seat changes until the subscription is
  // reactivated or has fully ended.
  const isSubscriptionCancelled =
    isSubscriptionCancellationScheduled(subscription);
  const [searchTerm, setSearchTerm] = useState("");
  const [seatTypeFilter, setSeatTypeFilter] = useState<
    MembershipSeatType | "none" | null
  >(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
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

  const handleSetGroupFilter = useCallback((next: string | null) => {
    setGroupFilter(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  // Name/email search is also applied server-side before pagination, so reset
  // to the first page whenever the search term changes.
  const handleSetSearchTerm = useCallback((next: string) => {
    setSearchTerm(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const sort = sorting[0];
  // The legacy table's pool-usage cell displays total consumption
  // (consumedAwuCredits), not the pool-only amount, so its "column" of the
  // same id must sort by the total. Only the compact/Poke variant, which
  // shows pool-only usage, sorts by consumedFromPoolAwuCredits.
  // TODO(avervaet, 2026-09-02): remove once the app page and Poke page usage
  // tables are uniformized.
  const membersOrderColumn =
    sort?.id === "email"
      ? sort.id
      : sort?.id === "consumedFromPoolAwuCredits"
        ? "consumedAwuCredits"
        : "name";
  const membersOrderDirection = sort?.desc ? "desc" : "asc";

  const { myUsage } = useMyUsage({
    workspaceId: owner.sId,
    disabled: !isCreditPriced,
  });
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
  const isWorkspaceAdmin = isAdmin(owner);
  const [membersTab, setMembersTab] = useState<"members" | "requests">(
    "members"
  );
  const [usageTab, setUsageTab] = useState<
    "members" | "groups" | "top-ups" | "settings"
  >("members");
  const { upgradeRequests, isUpgradeRequestsLoading } = useUpgradeRequests({
    workspaceId: owner.sId,
    disabled: !isCreditPriced,
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
  const { setUserAllowedModelTier, clearUserAllowedModelTier } =
    useUserAllowedModelTierMutations({ owner });
  const handleSetUserModelTier = useCallback(
    (member: MemberUsageType, selection: UserModelTierSelection) => {
      if (selection === INHERIT_MODEL_TIER) {
        void clearUserAllowedModelTier({ userId: member.sId });
        return;
      }

      void setUserAllowedModelTier({
        userId: member.sId,
        tierName: selection,
      });
    },
    [clearUserAllowedModelTier, setUserAllowedModelTier]
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
  // Auto-open the "change my seat" modal when arriving from a blocked-state
  useEffect(() => {
    if (isCreditPriced && openChangeMySeatParam !== null && myUsage !== null) {
      setChangeSeatMember(myUsage);
    }
  }, [isCreditPriced, openChangeMySeatParam, myUsage]);

  const {
    totalRemainingCredits,
    totalActiveCredits,
    overageCredits,
    isAwuPoolSummaryLoading,
    isAwuPoolSummaryError,
    mutateAwuPoolSummary,
  } = useAwuPoolSummary({
    workspaceId: owner.sId,
    disabled: !isCreditPriced,
  });

  // TODO(2026-08-24): add back logic to show consumption here.
  const showConsumptionAnalytics = false;

  const {
    overview: consumptionOverview,
    isOverviewLoading,
    isOverviewError,
  } = useConsumptionOverview({
    workspaceId: owner.sId,
    period: DEFAULT_CONSUMPTION_PERIOD,
    disabled: !showConsumptionAnalytics,
  });

  const { awuPurchaseInfo, isAwuPurchaseInfoLoading, isAwuPurchaseInfoError } =
    useAwuPurchaseInfo({
      workspaceId: owner.sId,
      disabled: !showBuyCreditDialog,
    });

  const {
    membersUsage,
    creditsResetAt,
    isMembersUsageLoading,
    isMembersUsageRefreshing,
    totalMembersUsage,
  } = useMembersUsage({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    orderColumn: membersOrderColumn,
    orderDirection: membersOrderDirection,
    seatType: seatTypeFilter ?? undefined,
    groupId: groupFilter ?? undefined,
    // Only the Members tab renders this data — skip the fetch (and its Metronome
    // per-user credit read) while another tab is active.
    disabled: usageTab !== "members",
  });

  const { groups } = useGroups({
    owner,
    kinds: [...CAP_ELIGIBLE_GROUP_KINDS],
    // Only feeds the Members tab (group filter + Groups column); the Groups tab
    // self-fetches via GroupsUsageTable.
    disabled: usageTab !== "members",
  });
  const selectedGroupName =
    groups.find((g) => g.sId === groupFilter)?.name ?? null;

  const { tiers: modelTiersCatalog } = useModelTiers({
    owner,
    disabled: !isWorkspaceAdmin,
  });
  const { users: userAllowedModelTiers } = useUserAllowedModelTiers({
    owner,
    disabled: !isWorkspaceAdmin,
  });
  const { groups: groupAllowedModelTiers } = useGroupAllowedModelTiers({
    owner,
    disabled: !isWorkspaceAdmin,
  });
  const { maxTierName: workspaceMaxTierName } = useWorkspaceAllowedModelTiers({
    owner,
    disabled: !isWorkspaceAdmin,
  });
  const modelTierDefinitionByName = useMemo(
    () => buildModelTierDefinitionByName(modelTiersCatalog),
    [modelTiersCatalog]
  );
  const workspaceAllowedModelTiers = useMemo(
    () => expandMaxTierName(workspaceMaxTierName ?? DEFAULT_MAX_MODEL_TIER),
    [workspaceMaxTierName]
  );
  const userModelTierSelectionByUserId = useMemo(() => {
    const map: Record<string, UserModelTierSelection> = {};
    for (const entry of userAllowedModelTiers) {
      map[entry.userId] = entry.maxTierName;
    }
    return map;
  }, [userAllowedModelTiers]);
  const userAllowedModelTiersByUserId = useMemo(() => {
    const map: Record<string, ModelsTierName[]> = {};
    for (const entry of userAllowedModelTiers) {
      map[entry.userId] = expandMaxTierName(entry.maxTierName);
    }
    return map;
  }, [userAllowedModelTiers]);
  const groupModelTiersByGroupId = useMemo(() => {
    const map: Record<string, ModelsTierName[]> = {};
    for (const entry of groupAllowedModelTiers) {
      map[entry.groupId] = expandMaxTierName(entry.maxTierName);
    }
    return map;
  }, [groupAllowedModelTiers]);
  const groupNameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      map.set(group.name, group.sId);
    }
    return map;
  }, [groups]);

  // Cross-page selection for batch actions on the members table. Resets when the
  // filter identity changes (the "all matching" set is no longer the same).
  const pageItemIds = useMemo(
    () => membersUsage.map((m) => m.sId),
    [membersUsage]
  );
  const selection = useTableRowsSelection({
    pageItemIds,
    totalCount: totalMembersUsage,
    resetKey: `${searchTerm}|${seatTypeFilter ?? ""}|${groupFilter ?? ""}`,
  });
  const { clearSelection } = selection;

  const { doBulkSetSpendLimit } = useBulkSetUserSpendLimit({
    workspaceId: owner.sId,
  });
  const [isBulkSpendLimitOpen, setIsBulkSpendLimitOpen] = useState(false);

  const handleBatchEditSpendLimit = useCallback(() => {
    setIsBulkSpendLimitOpen(true);
  }, []);

  const { doBulkChangeSeatType } = useBulkChangeSeatType({
    workspaceId: owner.sId,
  });
  const { doFetchSeatChangePreview } = useBulkSeatChangePreview({
    workspaceId: owner.sId,
  });
  const [isBulkChangeSeatOpen, setIsBulkChangeSeatOpen] = useState(false);

  const handleBatchChangeSeat = useCallback(() => {
    setIsBulkChangeSeatOpen(true);
  }, []);

  // Selected members visible on the current page, for the bulk seat modal's
  // avatar row (with an "all across pages" selection this is the visible
  // subset only).
  const selectedVisibleMembers = useMemo(
    () => membersUsage.filter((m) => selection.rowSelection[m.sId]),
    [membersUsage, selection.rowSelection]
  );

  // Translate the cross-page selection into the descriptor the bulk member
  // endpoints expect: explicit ids, or the current filter minus exclusions.
  const buildBulkSelectionBody = useCallback((): BulkMemberSelectionBody => {
    const descriptor = selection.descriptor();
    return descriptor.mode === "ids"
      ? { mode: "ids" as const, userIds: descriptor.ids }
      : {
          mode: "all" as const,
          filter: {
            seatType: seatTypeFilter ?? undefined,
            groupId: groupFilter ?? undefined,
            search: searchTerm.trim() || undefined,
          },
          excludeUserIds: descriptor.excludedIds,
        };
  }, [selection, seatTypeFilter, groupFilter, searchTerm]);

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
        const ok = await doUpdateSeatType({
          memberId: member.sId,
          memberName: member.name,
          seatType: "none",
          isCancellingScheduledChange: false,
          hasSeatPool: false,
        });
        if (ok) {
          clearSelection();
        }
      } finally {
        handleSeatChangePendingChange(member.sId, false);
      }
    },
    [confirm, doUpdateSeatType, handleSeatChangePendingChange, clearSelection]
  );

  const handleSeatMutationSaved = useCallback(() => {
    // Seat mutations can move a member in or out of the currently filtered set
    // (for example with the seat filter), which makes the cross-page selection
    // stale.
    clearSelection();
    handleApproveOnModalSaved();
  }, [handleApproveOnModalSaved, clearSelection]);

  // Rows to spin while a bulk update runs — the request returns once the bulk
  // workflow has completed. For an "all matching" selection only the current
  // page is visible, so spin its non-excluded rows.
  const getBulkPendingMemberIds = useCallback((): string[] => {
    const descriptor = selection.descriptor();
    return descriptor.mode === "ids"
      ? descriptor.ids
      : pageItemIds.filter((id) => !descriptor.excludedIds.includes(id));
  }, [selection, pageItemIds]);

  const handleBulkSpendLimitValidate = useCallback(
    async (
      limit: { kind: "unlimited" } | { kind: "limited"; awuCredits: number }
    ): Promise<boolean> => {
      const pendingMemberIds = getBulkPendingMemberIds();
      setTotalAllowedUsagePendingMemberIds((prev) => {
        const next = new Set(prev);
        pendingMemberIds.forEach((id) => next.add(id));
        return next;
      });

      try {
        const body = await doBulkSetSpendLimit({
          selection: buildBulkSelectionBody(),
          limit,
        });
        if (!body) {
          return false;
        }

        selection.clearSelection();
        return true;
      } finally {
        setTotalAllowedUsagePendingMemberIds((prev) => {
          const next = new Set(prev);
          pendingMemberIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [
      selection,
      buildBulkSelectionBody,
      getBulkPendingMemberIds,
      doBulkSetSpendLimit,
    ]
  );

  const handleBulkSeatChangePreview = useCallback(
    (seatType: PaidSeatType) =>
      doFetchSeatChangePreview({
        selection: buildBulkSelectionBody(),
        seatType,
      }),
    [doFetchSeatChangePreview, buildBulkSelectionBody]
  );

  const handleBulkChangeSeatValidate = useCallback(
    async ({
      seatType,
      seatName,
      hasDeferredChanges,
    }: {
      seatType: PaidSeatType;
      seatName: string;
      hasDeferredChanges: boolean;
    }): Promise<boolean> => {
      const pendingMemberIds = getBulkPendingMemberIds();
      setSeatChangePendingMemberIds((prev) => {
        const next = new Set(prev);
        pendingMemberIds.forEach((id) => next.add(id));
        return next;
      });

      try {
        const body = await doBulkChangeSeatType({
          selection: buildBulkSelectionBody(),
          seatType,
          seatName,
          hasDeferredChanges,
        });
        if (!body) {
          return false;
        }

        // Seat mutations can move members in or out of the currently filtered
        // set, which makes the cross-page selection stale.
        selection.clearSelection();
        return true;
      } finally {
        setSeatChangePendingMemberIds((prev) => {
          const next = new Set(prev);
          pendingMemberIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [
      selection,
      buildBulkSelectionBody,
      getBulkPendingMemberIds,
      doBulkChangeSeatType,
    ]
  );

  const { hasAvailableSeats } = useWorkspaceSeatAvailability({
    workspaceId: owner.sId,
    disabled: !isCreditPriced,
  });

  const { seatPlans, isSeatPlanLoading, isSeatPlanError } = useSeatPlan({
    workspaceId: owner.sId,
    disabled: !isCreditPriced,
  });

  const { perSeatPricing } = usePerSeatPricing({
    workspaceId: owner.sId,
    disabled: !isCreditPriced,
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

  const { usageSettings } = useUsageSettings({
    workspaceId: owner.sId,
    disabled: !isCreditPriced,
  });

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

  const poolConsumedCredits = Math.max(
    0,
    totalActiveCredits - totalRemainingCredits
  );

  const creditUsage = consumptionOverview?.creditUsage ?? null;
  const creditUsageDisplayTarget =
    creditUsage &&
    (creditUsage.status.target === "on_target" ? "on_target" : "off_target");

  const totalConsumedCredits = showConsumptionAnalytics
    ? (consumptionOverview?.totalCredits ?? poolConsumedCredits)
    : poolConsumedCredits;

  const initialTotalCredits = creditUsage?.capCredits ?? totalActiveCredits;
  const hasPool = totalActiveCredits > 0;

  const usedPercentage =
    creditUsage?.status.usedPercentage ??
    (initialTotalCredits > 0
      ? Math.round(
          Math.min(totalConsumedCredits / initialTotalCredits, 1) * 100
        )
      : 0);

  const cycleElapsedPercentage = consumptionOverview
    ? cycleElapsedPercent(consumptionOverview.period)
    : 0;
  const projectedPercentage =
    cycleElapsedPercentage > 0
      ? Math.min((usedPercentage / cycleElapsedPercentage) * 100, 100)
      : usedPercentage;

  const resetAt =
    creditUsage?.status.resetAt ??
    creditsResetAt ??
    consumptionOverview?.period.endDate ??
    null;

  const topUpButton = isWorkspaceAdmin ? (
    <Button
      label="Top up"
      icon={ArrowUp}
      size="sm"
      variant="outline"
      disabled={!isCreditPriced || !usageSettings.topUpEnabled}
      onClick={() => setShowBuyCreditDialog(true)}
    />
  ) : null;

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
          disabled={!isCreditPriced}
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
                ? seatTypeDisplayName(seatTypeFilter)
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
          icon={
            <Icon
              visual={SEAT_TYPE_ICONS["none"]}
              size="sm"
              className={getSeatIconColorClass("none")}
            />
          }
          onClick={() => handleSetSeatTypeFilter("none")}
        />
        {seatFilterOptions.map((seatType) => (
          <DropdownMenuItem
            key={seatType}
            label={seatTypeDisplayName(seatType)}
            icon={
              <Icon
                visual={SEAT_TYPE_ICONS[seatType]}
                size="sm"
                className={getSeatIconColorClass(seatType)}
              />
            }
            onClick={() => handleSetSeatTypeFilter(seatType)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const groupsFilterDropdown = groups.length > 0 && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          label={selectedGroupName ?? "All groups"}
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          label="All groups"
          onClick={() => handleSetGroupFilter(null)}
        />
        {groups.map((group) => (
          <DropdownMenuItem
            key={group.sId}
            label={group.name}
            onClick={() => handleSetGroupFilter(group.sId)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const membersTable = (
    <MembersUsageTable
      members={membersUsage}
      creditsResetAt={creditsResetAt}
      isLoading={isMembersUsageLoading}
      isRefreshing={isMembersUsageRefreshing}
      showSeatAndCredits={isCreditPriced}
      seatActionsDisabled={isSubscriptionCancelled}
      showSpendLimit={isCreditPriced && !isFreePlanWorkspace}
      showModelTiersColumn={isWorkspaceAdmin}
      userModelTierSelectionByUserId={userModelTierSelectionByUserId}
      userAllowedModelTiersByUserId={userAllowedModelTiersByUserId}
      groupModelTiersByGroupId={groupModelTiersByGroupId}
      workspaceAllowedModelTiers={workspaceAllowedModelTiers}
      groupNameToId={groupNameToId}
      modelTierDefinitionByName={modelTierDefinitionByName}
      totalAllowedUsagePendingMemberIds={totalAllowedUsagePendingMemberIds}
      seatChangePendingMemberIds={seatChangePendingMemberIds}
      isSeatBased={isSeatBased}
      onChangeSeat={handleChangeSeatFromTable}
      onRemoveSeat={onRemoveSeat}
      onEditSpendLimit={handleEditSpendLimitFromTable}
      onSetUserModelTier={handleSetUserModelTier}
      pagination={pagination}
      setPagination={setPagination}
      totalRowCount={totalMembersUsage}
      sorting={sorting}
      setSorting={handleSetSorting}
      showGroupsColumn={groups.length > 0}
      enableSelection={isCreditPriced}
      rowSelection={selection.rowSelection}
      onRowSelectionChange={selection.onRowSelectionChange}
    />
  );

  const selectionBanner = (
    <MembersSelectionBanner
      selectedCount={selection.selectedCount}
      totalCount={totalMembersUsage}
      hasMorePagesToSelect={selection.hasMorePagesToSelect}
      onSelectAllAcrossPages={selection.selectAllAcrossPages}
      onClear={selection.clearSelection}
      onBatchEditSpendLimit={handleBatchEditSpendLimit}
      onBatchChangeSeat={
        isSeatBased && !isFreePlanWorkspace && !isSubscriptionCancelled
          ? handleBatchChangeSeat
          : undefined
      }
      disabled={!isCreditPriced}
    />
  );

  return (
    <AdminPageContainer>
      <>
        <BuyAwuCreditsDialog
          isOpen={showBuyCreditDialog}
          onClose={() => setShowBuyCreditDialog(false)}
          onPurchaseSuccess={() => {
            void mutateAwuPoolSummary();
          }}
          workspaceId={owner.sId}
          awuPurchaseInfo={awuPurchaseInfo}
          isAwuPurchaseInfoLoading={isAwuPurchaseInfoLoading}
          isAwuPurchaseInfoError={!!isAwuPurchaseInfoError}
          currentTotalPoolCredits={totalActiveCredits}
        />

        <div
          className={
            showConsumptionAnalytics
              ? "flex flex-col items-stretch gap-8 pb-20"
              : "flex flex-col items-stretch gap-10 pb-20"
          }
        >
          {showConsumptionAnalytics ? (
            <Page.Header
              title={
                <div className="flex w-full items-center justify-between gap-4">
                  <Page.H variant="h3">Usage</Page.H>
                  <Button
                    label="Breakdown in analytics"
                    iconRight={LinkExternal01}
                    size="xs"
                    variant="highlight-ghost"
                    href={`/w/${owner.sId}/analytics/consumption`}
                  />
                </div>
              }
              description="Control credit consumption across your workspace."
            />
          ) : (
            <div className="flex items-center justify-between">
              <Page.Header title="Usage" />
              {isCreditPriced &&
                usageSettings.topUpEnabled &&
                isWorkspaceAdmin && (
                  <Button
                    label="Top up"
                    icon={ArrowUp}
                    size="sm"
                    variant="outline"
                    onClick={() => setShowBuyCreditDialog(true)}
                  />
                )}
            </div>
          )}

          {isCreditPricedFreePlan(subscription.plan.code) && (
            <FreePlanUpgradeSection
              action={
                <Button
                  label="Change my seat"
                  variant="highlight"
                  size="sm"
                  onClick={() => setChangeSeatMember(myUsage)}
                />
              }
            />
          )}

          {isCreditPriced && showConsumptionAnalytics ? (
            <Page.Vertical gap="none" align="stretch">
              <h2 className="heading-sm text-foreground">Credit Pool</h2>
              <div className="flex flex-col gap-2 pt-4">
                {isOverviewLoading ? (
                  <div
                    aria-label="Loading Credit Pool"
                    className="flex flex-col gap-2"
                    role="status"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1">
                        <LoadingBlock className="h-7.5 w-32" />
                        <LoadingBlock className="h-4 w-36" />
                      </div>
                      <LoadingBlock className="h-5 w-16 rounded-full" />
                    </div>
                    <LoadingBlock className="h-2 w-full rounded-xs" />
                    <div className="flex items-center justify-between gap-4">
                      <LoadingBlock className="h-5 w-12" />
                      <LoadingBlock className="h-5 w-20" />
                    </div>
                  </div>
                ) : isOverviewError ? (
                  <ContentMessage
                    title="Failed to load Workspace Credit Pool"
                    icon={AlertCircle}
                    variant="warning"
                  >
                    An error occurred while loading your Workspace Credit Pool
                    data. Please refresh the page or contact support if the
                    issue persists.
                  </ContentMessage>
                ) : consumptionOverview !== null &&
                  (creditUsage !== null || hasPool) ? (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-baseline gap-1">
                        <span className="heading-2xl text-foreground">
                          {formatCredits(totalConsumedCredits)}
                        </span>
                        <span className="copy-sm text-muted-foreground">
                          /{formatCredits(initialTotalCredits)} credits
                        </span>
                      </div>
                      {creditUsage && (
                        <Chip
                          size="mini"
                          color={
                            creditUsageDisplayTarget === "on_target"
                              ? "highlight"
                              : "warning"
                          }
                          label={
                            creditUsageDisplayTarget === "on_target"
                              ? "On target"
                              : "Off target"
                          }
                        />
                      )}
                    </div>
                    <CreditPoolProgressBar
                      projectedPercentage={projectedPercentage}
                      target={creditUsageDisplayTarget}
                      usedPercentage={usedPercentage}
                    />
                    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                      <span>{usedPercentage}% used</span>
                      {resetAt && (
                        <span>Resets {formatConsumptionDate(resetAt)}</span>
                      )}
                    </div>
                  </>
                ) : null}
                <div className="mt-2 flex flex-col justify-between gap-4 border-t border-border pt-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-foreground">
                    {!isOverviewError &&
                      consumptionOverview !== null &&
                      (creditUsage !== null || hasPool) && (
                        <>
                          {creditUsageDisplayTarget === "on_target" ? (
                            <span>
                              At your current rate, you have enough credits to
                              finish the cycle.
                            </span>
                          ) : resetAt ? (
                            <span>
                              At this rate, you&apos;re expected to consume your
                              full credits by{" "}
                              <span className="font-semibold">
                                {formatConsumptionDate(resetAt)}
                              </span>
                              .
                            </span>
                          ) : null}
                          {overageCredits !== null && overageCredits > 0 && (
                            <span className="text-muted-foreground">
                              {formatCredits(overageCredits)} overage credits
                            </span>
                          )}
                        </>
                      )}
                  </div>
                  {topUpButton}
                </div>
              </div>
            </Page.Vertical>
          ) : null}

          {isCreditPriced &&
          !showConsumptionAnalytics &&
          !isAwuPoolSummaryLoading &&
          (isAwuPoolSummaryError || hasPool) ? (
            <Page.Vertical gap="xs" align="stretch">
              <Page.H variant="h4">Workspace credit pool</Page.H>

              {isAwuPoolSummaryError ? (
                <ContentMessage
                  title="Failed to load Workspace Credits Pool"
                  icon={AlertCircle}
                  variant="warning"
                >
                  An error occurred while loading your Workspace Credits Pool
                  data. Please refresh the page or contact support if the issue
                  persists.
                </ContentMessage>
              ) : isAwuPoolSummaryLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className="heading-mono-4xl text-foreground">
                      {formatCredits(totalConsumedCredits)}
                    </span>
                    <span className="copy-sm text-muted-foreground">
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
                    {overageCredits !== null && overageCredits > 0 && (
                      <span className="copy-sm text-muted-foreground">
                        {formatCredits(overageCredits)} overage credits
                      </span>
                    )}
                    {isEnterprise && (
                      <span className="copy-sm text-muted-foreground">
                        Contact your Dust sales representative to buy credits
                      </span>
                    )}
                  </div>
                </>
              )}
            </Page.Vertical>
          ) : null}

          <Tabs
            value={usageTab}
            onValueChange={(v) =>
              setUsageTab(
                v === "groups" || v === "top-ups" || v === "settings"
                  ? v
                  : "members"
              )
            }
          >
            <TabsList className="mb-4">
              <TabsTrigger value="members" label="Members" />
              <TabsTrigger value="groups" label="Groups" />
              {isWorkspaceAdmin && isCreditPriced && (
                <TabsTrigger value="top-ups" label="Top-ups history" />
              )}
              {isWorkspaceAdmin && (
                <TabsTrigger value="settings" label="Settings" />
              )}
            </TabsList>

            <TabsContent value="members">
              <Page.Vertical gap="sm" align="stretch">
                {searchAndInviteRow}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-row items-center justify-between gap-2">
                    {isCreditPriced && (
                      <ButtonsSwitchList
                        size="xs"
                        defaultValue="members"
                        onValueChange={(v: string) =>
                          setMembersTab(
                            v === "requests" ? "requests" : "members"
                          )
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
                    )}
                    {membersTab === "members" && (
                      <div className="flex flex-row items-center gap-2">
                        {groupsFilterDropdown}
                        {isWorkspaceAdmin && groupFilter && (
                          <GroupModelTierPickerDropdown
                            owner={owner}
                            groupId={groupFilter}
                          />
                        )}
                        {isCreditPriced && seatFilterDropdown}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    {membersTab === "members" ? (
                      <>
                        {membersTable}
                        {selectionBanner}
                      </>
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
              </Page.Vertical>
            </TabsContent>
            <TabsContent value="groups">
              <GroupsUsageTable
                owner={owner}
                showSpendLimitColumn={isCreditPriced}
                showModelTiersColumn={isWorkspaceAdmin}
              />
            </TabsContent>

            {isWorkspaceAdmin && isCreditPriced && (
              <TabsContent value="top-ups">
                <TopUpsHistoryTable owner={owner} />
              </TabsContent>
            )}

            {isWorkspaceAdmin && (
              <TabsContent value="settings">
                <div className="flex flex-col gap-10">
                  {isCreditPriced && (
                    <UsageSettingsCard
                      workspaceId={owner.sId}
                      hasPool={hasPool}
                    />
                  )}
                  <ModelTiersSettingsCard owner={owner} />
                  {isCreditPriced && (
                    <LockedSection
                      locked={!isAwuPoolSummaryLoading && !hasPool}
                      className="flex flex-col gap-10"
                    >
                      <UsageProgrammaticLimitCard workspaceId={owner.sId} />
                      <UsageNotificationsCard workspaceId={owner.sId} />
                    </LockedSection>
                  )}
                </div>
              </TabsContent>
            )}
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
          isSeatPlanLoading={isSeatPlanLoading}
          isSeatPlanError={!!isSeatPlanError}
          onSavingChange={handleSeatChangePendingChange}
          onSaved={handleSeatMutationSaved}
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

        <BulkEditSpendLimitModal
          isOpen={isBulkSpendLimitOpen}
          onClose={() => setIsBulkSpendLimitOpen(false)}
          memberCount={selection.selectedCount}
          onValidate={handleBulkSpendLimitValidate}
        />
        <BulkChangeSeatModal
          isOpen={isBulkChangeSeatOpen}
          onClose={() => setIsBulkChangeSeatOpen(false)}
          memberCount={selection.selectedCount}
          selectedMembers={selectedVisibleMembers}
          seatPlans={seatPlans}
          onFetchPreview={handleBulkSeatChangePreview}
          onValidate={handleBulkChangeSeatValidate}
        />
      </>
    </AdminPageContainer>
  );
}
