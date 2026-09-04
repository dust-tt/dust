import { PokeChangeSeatModal } from "@app/components/poke/credits/PokeChangeSeatModal";
import { PokeMemberSpendLimitModal } from "@app/components/poke/credits/PokeMemberSpendLimitModal";
import { PokeTopUpsHistoryTable } from "@app/components/poke/credits/PokeTopUpsHistoryTable";
import {
  SEAT_TYPE_ICONS,
  seatTypeDisplayName,
} from "@app/components/workspace/billing/seatTypeUtils";
import { MembersUsageTable } from "@app/components/workspace/MembersUsageTable";
import { getSeatIconColorClass } from "@app/components/workspace/seat_styles";
import {
  toCreditPoolFetchStatus,
  WorkspaceCreditPoolSection,
} from "@app/components/workspace/WorkspaceCreditPoolCards";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { expandMaxTierName } from "@app/lib/client/model_tiers";
import { DEFAULT_MAX_MODEL_TIER } from "@app/lib/model_tiers/tier_order";
import {
  usePokeAwuPoolCurrentCycle,
  usePokeAwuPoolCycleHistory,
  usePokeMembersUsage,
  usePokeSeatPlan,
} from "@app/poke/swr/credits";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { usePokeGroups } from "@app/poke/swr/groups";
import { usePokeAllowedModelTiers } from "@app/poke/swr/model_tiers";
import { usePokeWorkspaceInfo } from "@app/poke/swr/workspace_info";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import { isCapEligibleGroupKind } from "@app/types/groups";
import type { MembershipSeatType } from "@app/types/memberships";
import {
  BILLABLE_SEAT_TYPES,
  SEAT_TYPE_ORDER,
  toBaseSeatType,
} from "@app/types/memberships";
import { isCreditPricedPlan } from "@app/types/plan";
import {
  AlertCircle,
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  LinkExternal01,
  LinkWrapper,
  Page,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 25;

const EMPTY_PENDING_MEMBER_IDS: ReadonlySet<string> = new Set();

function noopOnMember(_member: MemberUsageType) {}

// Base seat types a workspace can offer (yearly variants collapse into their
// base tier), ordered lowest to highest. Poke has no per-workspace seat-plan
// lookup, so — unlike the customer-facing filter — this always offers the
// full catalog rather than only the plans this workspace actually sells.
const SEAT_FILTER_OPTIONS: MembershipSeatType[] = Array.from(
  new Set(BILLABLE_SEAT_TYPES.map(toBaseSeatType))
).sort((a, b) => SEAT_TYPE_ORDER[a] - SEAT_TYPE_ORDER[b]);

interface PoolCreditCardProps {
  owner: ReturnType<typeof useWorkspace>;
}

function PoolCreditCard({ owner }: PoolCreditCardProps) {
  const {
    awuPoolCurrentCycle,
    isAwuPoolCurrentCycleLoading,
    isAwuPoolCurrentCycleError,
  } = usePokeAwuPoolCurrentCycle({ owner });
  const {
    cycleBreakdown: poolCycleBreakdown,
    excessCycleBreakdown,
    isAwuPoolCycleHistoryLoading,
    isAwuPoolCycleHistoryError,
  } = usePokeAwuPoolCycleHistory({ owner });

  const {
    totalRemainingCredits,
    totalActiveCredits,
    currentCycleConsumedCredits,
    currentCycleStartMs,
    currentCycleEndMs,
    excessConsumedCredits,
    programmaticConsumedCredits,
    otherConsumedCredits,
  } = awuPoolCurrentCycle ?? {
    totalRemainingCredits: 0,
    totalActiveCredits: 0,
    currentCycleConsumedCredits: null,
    currentCycleStartMs: null,
    currentCycleEndMs: null,
    excessConsumedCredits: null,
    programmaticConsumedCredits: null,
    otherConsumedCredits: null,
  };

  const hasPool = totalActiveCredits > 0;
  const hasExcessData =
    excessConsumedCredits !== null || excessCycleBreakdown.length > 0;

  return (
    <WorkspaceCreditPoolSection
      cardsStatus={toCreditPoolFetchStatus(
        isAwuPoolCurrentCycleLoading,
        !!isAwuPoolCurrentCycleError
      )}
      tableStatus={toCreditPoolFetchStatus(
        isAwuPoolCycleHistoryLoading,
        !!isAwuPoolCycleHistoryError
      )}
      showPoolCard={hasPool}
      isVisible={hasPool || hasExcessData}
      totalRemainingCredits={totalRemainingCredits}
      consumedCredits={
        hasPool ? currentCycleConsumedCredits : excessConsumedCredits
      }
      currentCycleStartMs={currentCycleStartMs}
      currentCycleEndMs={currentCycleEndMs}
      cycleBreakdown={hasPool ? poolCycleBreakdown : excessCycleBreakdown}
      programmaticConsumedCredits={programmaticConsumedCredits}
      otherConsumedCredits={otherConsumedCredits}
    />
  );
}

export function PoolUsagePage() {
  const owner = useWorkspace();
  usePokePageMetadata({ name: owner.name, subtitle: "Credits Usage" });

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [seatTypeFilter, setSeatTypeFilter] =
    useState<MembershipSeatType | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [changeSeatRecapMember, setChangeSeatRecapMember] =
    useState<MemberUsageType | null>(null);
  const [spendLimitRecapMember, setSpendLimitRecapMember] =
    useState<MemberUsageType | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "consumedFromPoolAwuCredits", desc: true },
  ]);

  // Debounce the search input, and reset to the first page on a new query.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const handleSetSorting = useCallback((next: SortingState) => {
    setSorting(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const handleSetSeatTypeFilter = useCallback(
    (next: MembershipSeatType | null) => {
      setSeatTypeFilter(next);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    []
  );

  const handleSetGroupFilter = useCallback((next: string | null) => {
    setGroupFilter(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const sort = sorting[0];
  const orderColumn =
    sort?.id === "email" ||
    sort?.id === "consumedFromPoolAwuCredits" ||
    sort?.id === "seatUsage"
      ? sort.id
      : "name";
  const orderDirection = sort?.desc ? "desc" : "asc";

  const { awuPoolCurrentCycle } = usePokeAwuPoolCurrentCycle({ owner });
  const hasPool = (awuPoolCurrentCycle?.totalActiveCredits ?? 0) > 0;

  const { data: workspaceInfo } = usePokeWorkspaceInfo({ owner });
  const activeSubscription = workspaceInfo?.activeSubscription;
  const hasMetronomeContract = activeSubscription?.metronomeContractId != null;
  const isLegacyPremiumMessagePlan =
    !!activeSubscription && !isCreditPricedPlan(activeSubscription.plan);
  // Users with no pool and no Metronome contract on a legacy plan only have
  // a premium-message rate limit — no pool/Metronome usage to show. The pool
  // cards and previous-cycles table would just render empty for them.
  const isLegacyWithoutPoolOrMetronome =
    isLegacyPremiumMessagePlan && !hasPool && !hasMetronomeContract;
  const showPoolSection = !isLegacyWithoutPoolOrMetronome;

  const {
    members,
    totalMembers,
    creditsResetAt,
    isMembersUsageLoading,
    isMembersUsageValidating,
    isMembersUsageError,
  } = usePokeMembersUsage({
    owner,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    search,
    orderColumn,
    orderDirection,
    seatType: seatTypeFilter ?? undefined,
    groupId: groupFilter ?? undefined,
  });

  const { seatPlans, isSeatPlanLoading, isSeatPlanError } = usePokeSeatPlan({
    owner,
  });
  const isSeatBased = Object.keys(seatPlans).length > 1;
  const canUpgradeSeat = useCallback(
    (member: MemberUsageType) =>
      isSeatBased &&
      !!member.seatType &&
      member.seatType !== "none" &&
      toBaseSeatType(member.seatType) !== "workspace",
    [isSeatBased]
  );

  const { data: allGroups } = usePokeGroups({ owner });
  const groups = useMemo(
    () => allGroups.filter((group) => isCapEligibleGroupKind(group.kind)),
    [allGroups]
  );
  const selectedGroupName = groups.find(
    (group) => group.sId === groupFilter
  )?.name;

  const {
    users: userAllowedModelTiers,
    groups: groupAllowedModelTiers,
    maxTierName: workspaceMaxTierName,
  } = usePokeAllowedModelTiers({ owner });

  const workspaceAllowedModelTiers = useMemo(
    () => expandMaxTierName(workspaceMaxTierName ?? DEFAULT_MAX_MODEL_TIER),
    [workspaceMaxTierName]
  );

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
    for (const group of allGroups) {
      map.set(group.name, group.sId);
    }
    return map;
  }, [allGroups]);

  const seatFilterDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          label={
            seatTypeFilter ? seatTypeDisplayName(seatTypeFilter) : "All seats"
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
        {SEAT_FILTER_OPTIONS.map((seatType) => (
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

  return (
    <main className="mx-auto w-full max-w-7xl">
      <Page.Header
        title={
          <div className="flex w-full items-center justify-between gap-4">
            <Page.H variant="h3">Credits usage</Page.H>
            <Button
              label="Breakdown in analytics"
              iconRight={LinkExternal01}
              size="xs"
              variant="highlight-ghost"
              href={`/poke/${owner.sId}/analytics`}
            />
          </div>
        }
        description={
          <>
            For workspace{" "}
            <LinkWrapper
              href={`/poke/${owner.sId}`}
              className="text-highlight-500"
            >
              {owner.name}
            </LinkWrapper>
            . Poke uses workspace-admin visibility, so resolved labels may
            differ from a customer manager&apos;s view. This is a read-only view
            — seat and spend-limit changes are disabled.
          </>
        }
      />

      <div className="flex flex-col items-stretch gap-10 py-6 pb-20">
        {showPoolSection && <PoolCreditCard owner={owner} />}

        <Tabs defaultValue="members">
          <TabsList className="mb-4">
            <TabsTrigger value="members" label="Members" />
            <TabsTrigger value="top-ups" label="Top-ups history" />
          </TabsList>

          <TabsContent value="members">
            <Page.Vertical gap="sm" align="stretch">
              <SearchInput
                placeholder="Search members"
                value={searchInput}
                name="search"
                onChange={setSearchInput}
              />
              <div className="flex flex-row items-center justify-end gap-2">
                {groupsFilterDropdown}
                {seatFilterDropdown}
              </div>
              {isMembersUsageError ? (
                <ContentMessage
                  title="Failed to load members usage"
                  icon={AlertCircle}
                  variant="warning"
                >
                  Could not load per-member seat and credit pool consumption
                  data for this workspace.
                </ContentMessage>
              ) : (
                <MembersUsageTable
                  members={members}
                  creditsResetAt={creditsResetAt}
                  isLoading={isMembersUsageLoading}
                  isRefreshing={
                    isMembersUsageValidating && !isMembersUsageLoading
                  }
                  totalAllowedUsagePendingMemberIds={EMPTY_PENDING_MEMBER_IDS}
                  seatChangePendingMemberIds={EMPTY_PENDING_MEMBER_IDS}
                  isSeatBased
                  showSpendLimit
                  hasPool={hasPool}
                  readOnly
                  onChangeSeat={noopOnMember}
                  onOpenChangeSeatRecap={setChangeSeatRecapMember}
                  onOpenSpendLimitRecap={setSpendLimitRecapMember}
                  canUpgradeSeat={canUpgradeSeat}
                  onRemoveSeat={noopOnMember}
                  onEditSpendLimit={noopOnMember}
                  pagination={pagination}
                  setPagination={setPagination}
                  totalRowCount={totalMembers}
                  sorting={sorting}
                  setSorting={handleSetSorting}
                  variant="compact"
                  showGroupsColumn={false}
                  showModelTiersColumn
                  userAllowedModelTiersByUserId={userAllowedModelTiersByUserId}
                  groupModelTiersByGroupId={groupModelTiersByGroupId}
                  workspaceAllowedModelTiers={workspaceAllowedModelTiers}
                  groupNameToId={groupNameToId}
                />
              )}
            </Page.Vertical>
          </TabsContent>

          <TabsContent value="top-ups">
            <PokeTopUpsHistoryTable owner={owner} />
          </TabsContent>
        </Tabs>
      </div>

      <PokeChangeSeatModal
        isOpen={!!changeSeatRecapMember}
        member={changeSeatRecapMember}
        seatPlans={seatPlans}
        isSeatPlanLoading={isSeatPlanLoading}
        isSeatPlanError={!!isSeatPlanError}
        onClose={() => setChangeSeatRecapMember(null)}
      />

      <PokeMemberSpendLimitModal
        isOpen={!!spendLimitRecapMember}
        member={spendLimitRecapMember}
        groups={groups}
        onClose={() => setSpendLimitRecapMember(null)}
      />
    </main>
  );
}
