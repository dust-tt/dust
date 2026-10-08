import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { EditMemberSpendLimitModal } from "@app/components/workspace/EditMemberSpendLimitModal";
import { GroupsUsageTable } from "@app/components/workspace/GroupsUsageTable";
import { MembersUsageTable } from "@app/components/workspace/MembersUsageTable";
import { UpgradeRequests } from "@app/components/workspace/UpgradeRequests";
import { UsageMembersSection } from "@app/components/workspace/UsageMembersSection";
import type { DefaultUserSpendLimitState } from "@app/components/workspace/WorkspaceDefaultLimitInput";
import { useSharedUsageLimitGroupColumn } from "@app/hooks/useGroupsUsage";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import { useGroups } from "@app/lib/swr/groups";
import { useMembersUsage } from "@app/lib/swr/memberships";
import { useUpgradeRequests } from "@app/lib/swr/upgrade_requests";
import { isCreditPricedPlan } from "@app/types/plan";
import {
  Page,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

const EMPTY_IDS = new Set<string>();
const NOOP_MEMBER_ACTION = (_member: MemberUsageType) => {};

export function GroupManagerUsagePage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { subscription, groupManagement } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const { tab: tabParam } = useQueryParams(["tab"]);
  const tab = tabParam.value === "groups" ? "groups" : "members";
  const setTab = (next: "members" | "groups") => {
    tabParam.setParam(next === "members" ? undefined : next);
  };
  const [membersTab, setMembersTab] = useState<"members" | "requests">(
    "members"
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedMember, setSelectedMember] = useState<MemberUsageType | null>(
    null
  );
  const { groups } = useGroups({ owner });
  const readScope = groupManagement?.read_usage;
  const editScope = groupManagement?.set_usage_limits;
  const visibleGroupIds = useMemo(
    () =>
      new Set(
        readScope?.kind === "all"
          ? groups.map((group) => group.sId)
          : (readScope?.groupIds ?? [])
      ),
    [groups, readScope]
  );
  const editableGroupIds = useMemo(
    () =>
      new Set(
        editScope?.kind === "all"
          ? groups.map((group) => group.sId)
          : (editScope?.groupIds ?? [])
      ),
    [groups, editScope]
  );
  const visibleGroups = useMemo(
    () => groups.filter((group) => visibleGroupIds.has(group.sId)),
    [groups, visibleGroupIds]
  );
  const editableGroupNames = useMemo(
    () =>
      new Set(
        groups
          .filter((group) => editableGroupIds.has(group.sId))
          .map((group) => group.name)
      ),
    [groups, editableGroupIds]
  );
  const canEditMember = useCallback(
    (member: MemberUsageType) =>
      member.groups.some((name) => editableGroupNames.has(name)),
    [editableGroupNames]
  );

  const effectiveSorting: SortingState =
    sorting.length === 0
      ? [{ id: "consumedFromPoolAwuCredits", desc: true }]
      : sorting;
  const sort = effectiveSorting[0];
  const {
    membersUsage,
    creditsResetAt,
    totalMembersUsage,
    isMembersUsageLoading,
    isMembersUsageRefreshing,
  } = useMembersUsage({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    orderColumn:
      sort?.id === "email" ||
      sort?.id === "seatUsage" ||
      sort?.id === "consumedFromPoolAwuCredits"
        ? sort.id
        : "name",
    orderDirection: sort?.desc ? "desc" : "asc",
    groupId: groupId ?? undefined,
    disabled: tab !== "members" || membersTab !== "members",
  });
  const isCreditPriced = isCreditPricedPlan(subscription.plan);
  const {
    showSharedUsageLimitGroupColumn,
    sharedUsageLimitUsageByGroupId,
    isSharedUsageLimitUsageLoading,
  } = useSharedUsageLimitGroupColumn({
    owner,
    enabled: isCreditPriced && hasFeature("group_limits"),
    disabled: tab !== "members" || membersTab !== "members",
  });
  const canHandleRequests = isCreditPriced && editableGroupIds.size > 0;
  const { upgradeRequests, isUpgradeRequestsLoading, isUpgradeRequestsError } =
    useUpgradeRequests({
      workspaceId: owner.sId,
      groupId: groupId ?? undefined,
      searchTerm,
      disabled: !canHandleRequests,
    });
  // The effective limit already includes the seat allowance. Show the
  // inherited workspace default when it is the active source, without calling
  // the workspace-only default-limit endpoint.
  const defaultUserSpendLimit: DefaultUserSpendLimitState =
    selectedMember?.spendLimitSource === "default" &&
    selectedMember.spendLimitAwuCredits !== null
      ? {
          status: "ready",
          awuCredits: Math.max(
            0,
            selectedMember.spendLimitAwuCredits -
              (selectedMember.memberUsageLimit ?? 0)
          ),
        }
      : { status: "unavailable" };

  return (
    <AdminPageContainer>
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header
          title={
            <Page.H variant="h3">
              <Trans>Credits</Trans>
            </Page.H>
          }
          description={t`Manage credit limits for members and groups in your scope.`}
        />
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setTab(value === "groups" ? "groups" : "members")
          }
          className="flex flex-col gap-4"
        >
          <TabsList>
            <TabsTrigger value="members" label={t`Members`} />
            <TabsTrigger value="groups" label={t`Groups`} />
          </TabsList>
          <TabsContent
            value="members"
            forceMount
            className={tab === "members" ? "block min-h-panel" : "hidden"}
          >
            <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.usage.members}>
              <UsageMembersSection
                searchTerm={searchTerm}
                onSearchChange={(value) => {
                  setSearchTerm(value);
                  setPagination((current) => ({ ...current, pageIndex: 0 }));
                }}
                groups={visibleGroups}
                groupId={groupId}
                onGroupChange={(value) => {
                  setGroupId(value);
                  setPagination((current) => ({ ...current, pageIndex: 0 }));
                }}
                allGroupsLabel={t`All managed groups`}
                requests={
                  canHandleRequests
                    ? {
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
                            editableGroupIds={editableGroupIds}
                          />
                        ),
                      }
                    : undefined
                }
                membersTable={
                  <MembersUsageTable
                    members={membersUsage}
                    isLoading={isMembersUsageLoading}
                    isRefreshing={isMembersUsageRefreshing}
                    totalAllowedUsagePendingMemberIds={EMPTY_IDS}
                    seatChangePendingMemberIds={EMPTY_IDS}
                    isSeatBased={false}
                    showSpendLimit={
                      isCreditPriced && !isFreePlan(subscription.plan.code)
                    }
                    canEditSpendLimit={canEditMember}
                    showSeatAndCredits={isCreditPriced}
                    showSeatActions={false}
                    showGroupsColumn={visibleGroups.length > 0}
                    showSharedUsageLimitGroupColumn={
                      showSharedUsageLimitGroupColumn
                    }
                    sharedUsageLimitUsageByGroupId={
                      sharedUsageLimitUsageByGroupId
                    }
                    isSharedUsageLimitUsageLoading={
                      isSharedUsageLimitUsageLoading
                    }
                    creditsResetAt={creditsResetAt}
                    onChangeSeat={NOOP_MEMBER_ACTION}
                    onRemoveSeat={NOOP_MEMBER_ACTION}
                    onEditSpendLimit={setSelectedMember}
                    onOpenSpendLimitRecap={setSelectedMember}
                    pagination={pagination}
                    setPagination={setPagination}
                    totalRowCount={totalMembersUsage}
                    sorting={effectiveSorting}
                    setSorting={(next) => {
                      setSorting(next);
                      setPagination((current) => ({
                        ...current,
                        pageIndex: 0,
                      }));
                    }}
                  />
                }
              />
            </AdminSectionAnchor>
          </TabsContent>
          <TabsContent value="groups" className="block min-h-panel">
            <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.usage.groups}>
              <GroupsUsageTable
                owner={owner}
                visibleGroupIds={visibleGroupIds}
                editableGroupIds={editableGroupIds}
                showSpendLimitColumn={isCreditPriced}
                showSharedUsageLimitColumn={
                  isCreditPriced && hasFeature("group_limits")
                }
              />
            </AdminSectionAnchor>
          </TabsContent>
        </Tabs>
        <EditMemberSpendLimitModal
          isOpen={selectedMember !== null}
          onClose={() => setSelectedMember(null)}
          member={selectedMember}
          owner={owner}
          groups={groups}
          editableGroupIds={editableGroupIds}
          readOnly={selectedMember ? !canEditMember(selectedMember) : true}
          canEditDefaultLimit={false}
          defaultUserSpendLimit={defaultUserSpendLimit}
        />
      </Page.Vertical>
    </AdminPageContainer>
  );
}
