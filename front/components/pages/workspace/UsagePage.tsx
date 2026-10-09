import { ConfirmContext } from "@app/components/Confirm";
import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { FreePlanUpgradeSection } from "@app/components/workspace/billing/FreePlanUpgradeSection";
import {
  SEAT_TYPE_ICONS,
  seatTypeDisplayName,
} from "@app/components/workspace/billing/seatTypeUtils";
import { BulkChangeSeatModal } from "@app/components/workspace/BulkChangeSeatModal";
import { BulkEditSpendLimitModal } from "@app/components/workspace/BulkEditSpendLimitModal";
import { BuyAwuCreditsDialog } from "@app/components/workspace/BuyAwuCreditsDialog";
import { ChangeSeatModal } from "@app/components/workspace/ChangeSeatModal";
import { EditMemberSpendLimitModal } from "@app/components/workspace/EditMemberSpendLimitModal";
import { GroupModelTierPickerDropdown } from "@app/components/workspace/GroupModelTierPickerDropdown";
import { GroupsUsageTable } from "@app/components/workspace/GroupsUsageTable";
import { MembersSelectionBanner } from "@app/components/workspace/MembersSelectionBanner";
import { MembersUsageTable } from "@app/components/workspace/MembersUsageTable";
import { getSeatIconColorClass } from "@app/components/workspace/seat_styles";
import { TopUpsHistoryTable } from "@app/components/workspace/TopUpsHistoryTable";
import { UpgradeRequests } from "@app/components/workspace/UpgradeRequests";
import { LockedSection } from "@app/components/workspace/usage/LockedSection";
import { UsageNotificationsCard } from "@app/components/workspace/usage/UsageNotificationsCard";
import { UsageProgrammaticLimitCard } from "@app/components/workspace/usage/UsageProgrammaticLimitCard";
import { UsageSettingsCard } from "@app/components/workspace/usage/UsageSettingsCard";
import { UsageMembersSection } from "@app/components/workspace/UsageMembersSection";
import { CreditPoolCards } from "@app/components/workspace/WorkspaceCreditPoolCards";
import type { DefaultUserSpendLimitState } from "@app/components/workspace/WorkspaceDefaultLimitInput";
import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { useTableRowsSelection } from "@app/hooks/useTableRowsSelection";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import {
  cycleElapsedPercent,
  DEFAULT_CONSUMPTION_PERIOD,
  formatConsumptionDate,
} from "@app/lib/analytics/consumption_period";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { formatCredits, roundCredits } from "@app/lib/client/credits";
import type { UserModelTierSelection } from "@app/lib/client/model_tier_options";
import { INHERIT_MODEL_TIER } from "@app/lib/client/model_tier_options";
import {
  buildModelTierDefinitionByName,
  expandMaxTierName,
} from "@app/lib/client/model_tiers";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatNumber } from "@app/lib/i18n/format";
import { DEFAULT_MAX_MODEL_TIER } from "@app/lib/model_tiers/tier_order";
import { isCreditPricedFreePlan, isFreePlan } from "@app/lib/plans/plan_codes";
import { useSearchParam } from "@app/lib/platform";
import {
  useAwuPoolCurrentCycle,
  useAwuPoolCycleHistory,
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
import { useUpgradeRequests } from "@app/lib/swr/upgrade_requests";
import {
  useDefaultUserSpendLimit,
  useUsageSettings,
} from "@app/lib/swr/usage_settings";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import type { GroupGrantableSeatType } from "@app/types/groups";
import {
  CAP_ELIGIBLE_GROUP_KINDS,
  isGroupGrantableSeatType,
} from "@app/types/groups";
import type { MembershipSeatType, PaidSeatType } from "@app/types/memberships";
import {
  isMembershipSeatType,
  isPaidSeatType,
  SEAT_TYPE_ORDER,
  toBaseSeatType,
} from "@app/types/memberships";
import {
  isSubscriptionCancellationScheduled,
  isSubscriptionMetronomeBilled,
} from "@app/types/plan";
import { isAdmin, isManager } from "@app/types/user";
import {
  AlertCircle,
  Button,
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
  Plus,
  ProgressBar,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

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
  const { t } = useLingui();
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
      aria-label={t`Workspace credit usage`}
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

// Keep every tab panel at least as tall as the scrolling panel so switching to a
// shorter (or still loading) tab never shrinks the page and clamps the scroll offset.
// Sparkle renders TabsContent as `contents`, so `block` is required for the min-height to apply.
const TAB_CONTENT_CLASS = "block min-h-panel";

/**
 * Credits admin page for credit-priced workspaces. Non–credit-priced workspaces
 * use NonCreditPricedUsagePage instead (selected at the /credits route).
 */
export function UsagePage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const groupSeatProvisioningEnabled = hasFeature("group_seat_provisioning");
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
  const [sorting, setSorting] = useState<SortingState>([]);

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

  const effectiveSorting: SortingState =
    sorting.length === 0
      ? [{ id: "consumedFromPoolAwuCredits", desc: true }]
      : sorting;
  const sort = effectiveSorting[0];
  const membersOrderColumn =
    sort?.id === "email" ||
    sort?.id === "seatUsage" ||
    sort?.id === "consumedFromPoolAwuCredits"
      ? sort.id
      : "name";
  const membersOrderDirection = sort?.desc ? "desc" : "asc";

  const { myUsage } = useMyUsage({
    workspaceId: owner.sId,
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
  const [spendLimitRecapMember, setSpendLimitRecapMember] =
    useState<MemberUsageType | null>(null);
  const [isBulkSpendLimitOpen, setIsBulkSpendLimitOpen] = useState(false);
  const hasMetronomeContract = isSubscriptionMetronomeBilled(subscription);
  const { defaultUserSpendLimit, isDefaultUserSpendLimitError } =
    useDefaultUserSpendLimit({
      workspaceId: owner.sId,
      disabled:
        (spendLimitRecapMember === null && !isBulkSpendLimitOpen) ||
        !hasMetronomeContract,
    });
  // Same availability rule as the workspace read endpoint and poke's
  // PoolUsagePage: the default pool limit only exists for Metronome-billed
  // workspaces.
  const defaultUserSpendLimitState: DefaultUserSpendLimitState =
    !hasMetronomeContract
      ? { status: "unavailable" }
      : defaultUserSpendLimit
        ? { status: "ready", awuCredits: defaultUserSpendLimit.awuCredits }
        : isDefaultUserSpendLimitError
          ? { status: "error" }
          : { status: "loading" };
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
  const { tab: tabParam } = useQueryParams(["tab"]);
  const usageTab: "members" | "groups" | "top-ups" | "settings" = (() => {
    const value = tabParam.value;
    if (value === "groups") {
      return "groups";
    }
    if (value === "top-ups" && isWorkspaceAdmin) {
      return "top-ups";
    }
    if (value === "settings" && isWorkspaceAdmin) {
      return "settings";
    }
    return "members";
  })();
  const setUsageTab = (next: "members" | "groups" | "top-ups" | "settings") => {
    tabParam.setParam(next === "members" ? undefined : next);
  };
  const { upgradeRequests, isUpgradeRequestsLoading, isUpgradeRequestsError } =
    useUpgradeRequests({
      workspaceId: owner.sId,
      searchTerm,
      groupId: groupFilter ?? undefined,
    });

  const handleChangeSeatFromTable = useCallback((member: MemberUsageType) => {
    setChangeSeatMember(member);
  }, []);
  const handleEditSpendLimitFromTable = useCallback(
    (member: MemberUsageType) => {
      setSpendLimitRecapMember(member);
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

  // Auto-open the "change my seat" modal when arriving from a blocked-state
  useEffect(() => {
    if (openChangeMySeatParam !== null && myUsage !== null) {
      setChangeSeatMember(myUsage);
    }
  }, [openChangeMySeatParam, myUsage]);

  const {
    awuPoolCurrentCycle,
    isAwuPoolCurrentCycleLoading,
    mutateAwuPoolCurrentCycle,
  } = useAwuPoolCurrentCycle({
    workspaceId: owner.sId,
  });
  const totalRemainingCredits = awuPoolCurrentCycle?.totalRemainingCredits ?? 0;
  const totalActiveCredits = awuPoolCurrentCycle?.totalActiveCredits ?? 0;
  const overageCredits = awuPoolCurrentCycle?.overageCredits ?? null;

  // Cycle history is only rendered by CreditPoolCards, which owns its own
  // (paginated) fetch; borrow its mutate so a purchase revalidates it too.
  const { mutateAwuPoolCycleHistory } = useAwuPoolCycleHistory({
    workspaceId: owner.sId,
    disabled: true,
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

  // Names of groups that grant a seat: a member of any of these has their seat
  // managed by group membership, so manual seat changes are locked for them.
  const seatGrantingGroupNames = useMemo(
    () =>
      new Set(
        groups.filter((g) => g.grantedSeatType !== null).map((g) => g.name)
      ),
    [groups]
  );
  const isSeatManagedByGroup = useCallback(
    (member: MemberUsageType | null): boolean =>
      groupSeatProvisioningEnabled &&
      member !== null &&
      member.groups.some((name) => seatGrantingGroupNames.has(name)),
    [groupSeatProvisioningEnabled, seatGrantingGroupNames]
  );

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

  const { doBulkChangeSeatType } = useBulkChangeSeatType({
    workspaceId: owner.sId,
  });
  const { doFetchSeatChangePreview } = useBulkSeatChangePreview({
    workspaceId: owner.sId,
  });
  const [isBulkChangeSeatOpen, setIsBulkChangeSeatOpen] = useState(false);

  // Remember loaded members so picks from other pages keep their avatar.
  const [loadedMembersById, setLoadedMembersById] = useState(
    () => new Map(membersUsage.map((m) => [m.sId, m]))
  );
  const [prevMembersUsage, setPrevMembersUsage] = useState(membersUsage);
  if (membersUsage !== prevMembersUsage) {
    setPrevMembersUsage(membersUsage);
    setLoadedMembersById((prev) => {
      const next = new Map(prev);
      for (const m of membersUsage) {
        next.set(m.sId, m);
      }
      return next;
    });
  }

  // In pick order so avatars stay put. A "select all" spans members never
  // loaded, so its members are only shown once the loaded page holds the whole
  // selection, rather than a misleading subset.
  const selectedVisibleMembers = useMemo(() => {
    const descriptor = selection.descriptor();
    if (descriptor.mode === "ids") {
      return descriptor.ids.flatMap((id) => loadedMembersById.get(id) ?? []);
    }
    const excludedIds = new Set(descriptor.excludedIds);
    const selectedOnPage = membersUsage.filter((m) => !excludedIds.has(m.sId));
    return selectedOnPage.length === selection.selectedCount
      ? selectedOnPage
      : [];
    // oxlint-disable-next-line react/exhaustive-deps -- not reported by the previous linter; deps kept as-is
  }, [
    loadedMembersById,
    membersUsage,
    selection.descriptor,
    selection.selectedCount,
  ]);

  // A single selected member gets the individual modals
  const singleSelectedMember =
    selection.selectedCount === 1 && selectedVisibleMembers.length === 1
      ? selectedVisibleMembers[0]
      : null;
  const handleBatchChangeSeat = useCallback(() => {
    if (singleSelectedMember) {
      handleChangeSeatFromTable(singleSelectedMember);
      return;
    }
    setIsBulkChangeSeatOpen(true);
  }, [singleSelectedMember, handleChangeSeatFromTable]);

  const handleBatchEditSpendLimit = useCallback(() => {
    if (
      isMembershipSeatType(singleSelectedMember?.seatType) &&
      isPaidSeatType(singleSelectedMember.seatType)
    ) {
      handleEditSpendLimitFromTable(singleSelectedMember);
      return;
    }
    setIsBulkSpendLimitOpen(true);
  }, [singleSelectedMember, handleEditSpendLimitFromTable]);

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
      const memberName = member.name;
      const message =
        member.seatType === "free"
          ? t`Are you sure you want to remove ${memberName}'s seat? They will immediately lose the ability to send messages, and the Free seat cannot be re-granted.`
          : t`Are you sure you want to remove ${memberName}'s seat? They will keep access until the end of the current billing period, then lose the ability to send messages.`;
      const confirmed = await confirm({
        title: t`Remove seat`,
        message,
        validateLabel: t`Remove seat`,
        validateVariant: "warning",
        cancelLabel: t`Cancel`,
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
    [
      confirm,
      doUpdateSeatType,
      handleSeatChangePendingChange,
      clearSelection,
      t,
    ]
  );

  const handleSeatMutationSaved = useCallback(() => {
    // Seat mutations can move a member in or out of the currently filtered set
    // (for example with the seat filter), which makes the cross-page selection
    // stale.
    clearSelection();
  }, [clearSelection]);

  const handleSpendLimitSaved = useCallback(() => {
    // A single-member selection can be routed to this modal, so clear the
    // selection on save like the other selection-driven mutations do.
    clearSelection();
  }, [clearSelection]);

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
    async (limit: UserSpendLimit): Promise<boolean> => {
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
        return body !== null;
      } finally {
        setTotalAllowedUsagePendingMemberIds((prev) => {
          const next = new Set(prev);
          pendingMemberIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [buildBulkSelectionBody, getBulkPendingMemberIds, doBulkSetSpendLimit]
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
      hasDeferredChanges,
    }: {
      seatType: PaidSeatType;
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

  const { seatPlans, isSeatPlanLoading, isSeatPlanError } = useSeatPlan({
    workspaceId: owner.sId,
  });

  const isSeatBased = Object.keys(seatPlans).length > 1;

  const canUpgradeSeat = useCallback(
    (member: MemberUsageType) =>
      isSeatBased &&
      !isSubscriptionCancelled &&
      !!member.seatType &&
      member.seatType !== "none" &&
      toBaseSeatType(member.seatType) !== "workspace",
    [isSeatBased, isSubscriptionCancelled]
  );

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

  // Grantable seat tiers the contract bills — one entry per tier
  // (workspace/pro/max), regardless of cadence, ordered by tier. Derived from the
  // already-ordered `seatFilterOptions` (base tiers), so cadences are collapsed:
  // a Pro row shows whether the contract bills pro, pro_yearly, or both.
  const grantableSeatTypes: GroupGrantableSeatType[] = seatFilterOptions.filter(
    isGroupGrantableSeatType
  );

  const { usageSettings } = useUsageSettings({
    workspaceId: owner.sId,
  });

  const plan = subscription.plan;
  const isFreePlanWorkspace = isFreePlan(plan.code);
  const seatsHaveBuiltInAllowance = Object.values(seatPlans).some(
    (info) => (info?.awuCredits ?? 0) > 0
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

  const usedPercent = formatNumber(usedPercentage / 100, { style: "percent" });

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
  const resetAtFormatted = resetAt
    ? formatConsumptionDate(resetAt, getActiveLocale())
    : null;
  const initialTotalCreditsFormatted = formatCredits(initialTotalCredits);
  const initialTotalCreditCount = roundCredits(initialTotalCredits);
  const overageCreditsFormatted =
    overageCredits !== null ? formatCredits(overageCredits) : null;

  const topUpButton = isWorkspaceAdmin ? (
    <Button
      label={t`Add credits`}
      icon={Plus}
      size="sm"
      variant="outline"
      disabled={!usageSettings.topUpEnabled}
      onClick={() => setShowBuyCreditDialog(true)}
    />
  ) : null;

  const seatFilterDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          label={
            seatTypeFilter === "none"
              ? t`No seat`
              : seatTypeFilter
                ? seatTypeDisplayName(seatTypeFilter, t)
                : t`All seats`
          }
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          label={t`All seats`}
          onClick={() => handleSetSeatTypeFilter(null)}
        />
        <DropdownMenuItem
          label={t`No seat`}
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
            label={seatTypeDisplayName(seatType, t)}
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

  const membersTable = (
    <MembersUsageTable
      members={membersUsage}
      isLoading={isMembersUsageLoading}
      isRefreshing={isMembersUsageRefreshing}
      showSeatAndCredits
      seatActionsDisabled={isSubscriptionCancelled}
      showSpendLimit={!isFreePlanWorkspace}
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
      onOpenChangeSeatRecap={handleChangeSeatFromTable}
      onOpenSpendLimitRecap={handleEditSpendLimitFromTable}
      canUpgradeSeat={canUpgradeSeat}
      onSetUserModelTier={handleSetUserModelTier}
      pagination={pagination}
      setPagination={setPagination}
      totalRowCount={totalMembersUsage}
      sorting={effectiveSorting}
      setSorting={handleSetSorting}
      showGroupsColumn={groups.length > 0}
      enableSelection
      rowSelection={selection.rowSelection}
      onRowSelectionChange={selection.onRowSelectionChange}
      hasPool={hasPool}
    />
  );

  const selectionBanner = (
    <MembersSelectionBanner
      selectedCount={selection.selectedCount}
      selectedMembers={selectedVisibleMembers}
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
    />
  );

  return (
    <AdminPageContainer>
      <>
        <BuyAwuCreditsDialog
          isOpen={showBuyCreditDialog}
          onClose={() => setShowBuyCreditDialog(false)}
          onPurchaseSuccess={() => {
            void mutateAwuPoolCurrentCycle();
            void mutateAwuPoolCycleHistory();
          }}
          workspaceId={owner.sId}
          awuPurchaseInfo={awuPurchaseInfo}
          isAwuPurchaseInfoLoading={isAwuPurchaseInfoLoading}
          isAwuPurchaseInfoError={!!isAwuPurchaseInfoError}
          currentTotalPoolCredits={totalActiveCredits}
        />

        <Page.Vertical align="stretch" gap="xl">
          {showConsumptionAnalytics ? (
            <Page.Header
              title={
                <div className="flex w-full items-center justify-between gap-4">
                  <Page.H variant="h3">
                    <Trans>Credits</Trans>
                  </Page.H>
                  <Button
                    label={t`Breakdown in analytics`}
                    iconRight={LinkExternal01}
                    size="xs"
                    variant="highlight-ghost"
                    href={`/w/${owner.sId}/analytics/consumption`}
                  />
                  {isWorkspaceAdmin ? (
                    <AdminSectionAnchor
                      sectionId={ADMIN_SECTION_IDS.usage.addCredits}
                    >
                      <div className="flex justify-end">{topUpButton}</div>
                    </AdminSectionAnchor>
                  ) : null}
                </div>
              }
              description={t`Control credit consumption across your workspace.`}
            />
          ) : (
            <Page.Header
              title={
                <div className="flex w-full items-center justify-between gap-4">
                  <Page.H variant="h3">
                    <Trans>Credits</Trans>
                  </Page.H>
                  <div className="flex items-center gap-4">
                    <Button
                      label={t`Breakdown in analytics`}
                      iconRight={LinkExternal01}
                      size="xs"
                      variant="highlight-ghost"
                      href={`/w/${owner.sId}/analytics/consumption`}
                    />
                    {isWorkspaceAdmin ? (
                      <AdminSectionAnchor
                        sectionId={ADMIN_SECTION_IDS.usage.addCredits}
                      >
                        <div className="flex justify-end">{topUpButton}</div>
                      </AdminSectionAnchor>
                    ) : null}
                  </div>
                </div>
              }
              description={t`Control credit consumption across your workspace.`}
            />
          )}

          {isCreditPricedFreePlan(subscription.plan.code) && (
            <FreePlanUpgradeSection
              action={
                <Button
                  label={t`Change my seat`}
                  variant="highlight"
                  size="sm"
                  onClick={() => setChangeSeatMember(myUsage)}
                />
              }
            />
          )}

          {showConsumptionAnalytics ? (
            <div className="flex flex-col gap-4">
              <h2 className="heading-sm text-foreground">
                <Trans>Credit Pool</Trans>
              </h2>
              <div className="flex flex-col gap-2">
                {isOverviewLoading ? (
                  <div
                    aria-label={t`Loading Credit Pool`}
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
                    title={t`Failed to load Workspace Credit Pool`}
                    icon={AlertCircle}
                    variant="warning"
                  >
                    <Trans>
                      An error occurred while loading your Workspace Credit Pool
                      data. Please refresh the page or contact support if the
                      issue persists.
                    </Trans>
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
                          {t`${plural(initialTotalCreditCount, {
                            one: `/${initialTotalCreditsFormatted} credit`,
                            other: `/${initialTotalCreditsFormatted} credits`,
                          })}`}
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
                              ? t`On target`
                              : t`Off target`
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
                      <span>
                        <Trans>{usedPercent} used</Trans>
                      </span>
                      {resetAt && (
                        <span>
                          <Trans>Resets {resetAtFormatted}</Trans>
                        </span>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
              <Separator />
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-foreground">
                  {!isOverviewError &&
                    consumptionOverview !== null &&
                    (creditUsage !== null || hasPool) && (
                      <>
                        {creditUsageDisplayTarget === "on_target" ? (
                          <span>
                            <Trans>
                              At your current rate, you have enough credits to
                              finish the cycle.
                            </Trans>
                          </span>
                        ) : resetAt ? (
                          <span>
                            <Trans>
                              At this rate, you're expected to consume your full
                              credits by{" "}
                              <span className="font-semibold">
                                {resetAtFormatted}
                              </span>
                              .
                            </Trans>
                          </span>
                        ) : null}
                        {overageCredits !== null && overageCredits > 0 && (
                          <span className="text-muted-foreground">
                            {t`${plural(overageCredits, {
                              one: `${overageCreditsFormatted} overage credit`,
                              other: `${overageCreditsFormatted} overage credits`,
                            })}`}
                          </span>
                        )}
                      </>
                    )}
                </div>
                {topUpButton}
              </div>
            </div>
          ) : null}

          <CreditPoolCards owner={owner} disabled={false} />

          <Tabs
            value={usageTab}
            onValueChange={(v) =>
              setUsageTab(
                v === "groups" || v === "top-ups" || v === "settings"
                  ? v
                  : "members"
              )
            }
            className="flex flex-col gap-4"
          >
            <TabsList>
              <TabsTrigger value="members" label={t`Members`} />
              <TabsTrigger value="groups" label={t`Groups`} />
              {isWorkspaceAdmin && (
                <TabsTrigger value="top-ups" label={t`Top-ups history`} />
              )}
              {isWorkspaceAdmin && (
                <TabsTrigger value="settings" label={t`Settings`} />
              )}
            </TabsList>

            <TabsContent
              value="members"
              forceMount
              className={usageTab === "members" ? TAB_CONTENT_CLASS : "hidden"}
            >
              <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.usage.members}>
                <UsageMembersSection
                  searchTerm={searchTerm}
                  onSearchChange={handleSetSearchTerm}
                  groups={groups}
                  groupId={groupFilter}
                  onGroupChange={handleSetGroupFilter}
                  extraFilters={
                    <>
                      {isWorkspaceAdmin && groupFilter && (
                        <GroupModelTierPickerDropdown
                          owner={owner}
                          groupId={groupFilter}
                        />
                      )}
                      {seatFilterDropdown}
                    </>
                  }
                  membersTable={membersTable}
                  selectionBanner={selectionBanner}
                  requests={{
                    count: upgradeRequests.length,
                    activeTab: membersTab,
                    onTabChange: setMembersTab,
                    table: (
                      <UpgradeRequests
                        owner={owner}
                        requests={upgradeRequests}
                        isLoading={isUpgradeRequestsLoading}
                        isError={isUpgradeRequestsError}
                        groups={groups}
                        seatUpgrade={{
                          plans: seatPlans,
                          isLoading: isSeatPlanLoading,
                          isError: !!isSeatPlanError,
                          isManagedByGroup: isSeatManagedByGroup,
                          onSavingChange: handleSeatChangePendingChange,
                        }}
                        onSpendLimitSavingChange={handleUsagePendingChange}
                        onSaved={clearSelection}
                      />
                    ),
                  }}
                />
              </AdminSectionAnchor>
            </TabsContent>
            <TabsContent value="groups" className={TAB_CONTENT_CLASS}>
              <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.usage.groups}>
                <GroupsUsageTable
                  owner={owner}
                  showSpendLimitColumn
                  showModelTiersColumn={isWorkspaceAdmin}
                  showSharedUsageLimitColumn={hasFeature("group_limits")}
                  canEditSharedUsageLimit
                  seatOptions={
                    isWorkspaceAdmin &&
                    groupSeatProvisioningEnabled &&
                    grantableSeatTypes.length > 0
                      ? { grantableSeatTypes, seatPlans }
                      : undefined
                  }
                />
              </AdminSectionAnchor>
            </TabsContent>

            {isWorkspaceAdmin && (
              <TabsContent value="top-ups" className={TAB_CONTENT_CLASS}>
                <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.usage.topUps}>
                  <TopUpsHistoryTable owner={owner} />
                </AdminSectionAnchor>
              </TabsContent>
            )}

            {isWorkspaceAdmin && (
              <TabsContent
                value="settings"
                forceMount
                className={
                  usageTab === "settings" ? TAB_CONTENT_CLASS : "hidden"
                }
              >
                <Page.Vertical align="stretch" gap="xl">
                  <AdminSectionAnchor
                    sectionId={ADMIN_SECTION_IDS.usage.spendingPolicies}
                  >
                    <UsageSettingsCard
                      workspaceId={owner.sId}
                      hasPool={hasPool}
                      seatsHaveBuiltInAllowance={seatsHaveBuiltInAllowance}
                    />
                  </AdminSectionAnchor>
                  <LockedSection
                    locked={!isAwuPoolCurrentCycleLoading && !hasPool}
                    className="flex flex-col gap-8"
                  >
                    <AdminSectionAnchor
                      sectionId={ADMIN_SECTION_IDS.usage.programmatic}
                    >
                      <div className="flex flex-col gap-8">
                        <UsageProgrammaticLimitCard owner={owner} />
                      </div>
                    </AdminSectionAnchor>
                    <AdminSectionAnchor
                      sectionId={ADMIN_SECTION_IDS.usage.notifications}
                    >
                      <UsageNotificationsCard workspaceId={owner.sId} />
                    </AdminSectionAnchor>
                  </LockedSection>
                </Page.Vertical>
              </TabsContent>
            )}
          </Tabs>
        </Page.Vertical>

        <ChangeSeatModal
          isOpen={changeSeatMember !== null}
          onClose={() => {
            setChangeSeatMember(null);
          }}
          member={changeSeatMember}
          owner={owner}
          seatPlans={seatPlans}
          isSeatPlanLoading={isSeatPlanLoading}
          isSeatPlanError={!!isSeatPlanError}
          onSavingChange={handleSeatChangePendingChange}
          onSaved={handleSeatMutationSaved}
          seatManagedByGroup={isSeatManagedByGroup(changeSeatMember)}
        />

        <EditMemberSpendLimitModal
          isOpen={spendLimitRecapMember !== null}
          onClose={() => {
            setSpendLimitRecapMember(null);
          }}
          member={spendLimitRecapMember}
          owner={owner}
          groups={groups}
          readOnly={!isManager(owner)}
          canEditDefaultLimit={isWorkspaceAdmin}
          defaultUserSpendLimit={defaultUserSpendLimitState}
          onSavingChange={handleUsagePendingChange}
          onSaved={handleSpendLimitSaved}
        />

        <BulkEditSpendLimitModal
          isOpen={isBulkSpendLimitOpen}
          onClose={() => setIsBulkSpendLimitOpen(false)}
          memberCount={selection.selectedCount}
          selectedMembers={selectedVisibleMembers}
          owner={owner}
          seatsHaveBuiltInAllowance={seatsHaveBuiltInAllowance}
          canEditDefaultLimit={isWorkspaceAdmin}
          defaultUserSpendLimit={defaultUserSpendLimitState}
          onValidate={handleBulkSpendLimitValidate}
          onSaved={clearSelection}
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
