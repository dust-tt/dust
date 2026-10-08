import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { LegacyProgrammaticUsagePanel } from "@app/components/pages/workspace/developers/LegacyProgrammaticUsagePanel";
import { GroupModelTierPickerDropdown } from "@app/components/workspace/GroupModelTierPickerDropdown";
import { GroupsUsageTable } from "@app/components/workspace/GroupsUsageTable";
import { MembersUsageTable } from "@app/components/workspace/MembersUsageTable";
import { UsageProgrammaticLimitCard } from "@app/components/workspace/usage/UsageProgrammaticLimitCard";
import { UsageMembersSection } from "@app/components/workspace/UsageMembersSection";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import type { UserModelTierSelection } from "@app/lib/client/model_tier_options";
import { INHERIT_MODEL_TIER } from "@app/lib/client/model_tier_options";
import {
  buildModelTierDefinitionByName,
  expandMaxTierName,
} from "@app/lib/client/model_tiers";
import { DEFAULT_MAX_MODEL_TIER } from "@app/lib/model_tiers/tier_order";
import { useGroups } from "@app/lib/swr/groups";
import { useMembersUsage } from "@app/lib/swr/memberships";
import {
  useGroupAllowedModelTiers,
  useModelTiers,
  useUserAllowedModelTierMutations,
  useUserAllowedModelTiers,
  useWorkspaceAllowedModelTiers,
} from "@app/lib/swr/model_tiers";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import { isAdmin } from "@app/types/user";
import {
  Button,
  LinkExternal01,
  Page,
  Plus,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 25;
const EMPTY_IDS = new Set<string>();
const NOOP_MEMBER_ACTION = (_member: MemberUsageType) => {};

// Keep every tab panel at least as tall as the scrolling panel so switching to a
// shorter (or still loading) tab never shrinks the page and clamps the scroll offset.
// Sparkle renders TabsContent as `contents`, so `block` is required for the min-height to apply.
const TAB_CONTENT_CLASS = "block min-h-panel";

type UsageTab = "members" | "groups" | "programmatic-usage" | "settings";

/**
 * Credits admin page for workspaces that are not on a credit-priced plan.
 * No credit pool, seats, spend limits, or upgrade requests — model tiers and
 * programmatic usage (legacy credits + limits) remain editable.
 */
export function NonCreditPricedUsagePage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const isWorkspaceAdmin = isAdmin(owner);

  const [searchTerm, setSearchTerm] = useState("");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [showBuyCreditDialog, setShowBuyCreditDialog] = useState(false);

  const handleSetSorting = useCallback((next: SortingState) => {
    setSorting(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const handleSetGroupFilter = useCallback((next: string | null) => {
    setGroupFilter(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

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

  const { tab: tabParam } = useQueryParams(["tab"]);
  const usageTab: UsageTab = (() => {
    const value = tabParam.value;
    if (value === "groups") {
      return "groups";
    }
    if (value === "programmatic-usage") {
      return "programmatic-usage";
    }
    if (value === "settings" && isWorkspaceAdmin) {
      return "settings";
    }
    return "members";
  })();
  const setUsageTab = (next: UsageTab) => {
    tabParam.setParam(next === "members" ? undefined : next);
  };

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

  const {
    membersUsage,
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
    groupId: groupFilter ?? undefined,
    disabled: usageTab !== "members",
  });

  const { groups } = useGroups({
    owner,
    kinds: [...CAP_ELIGIBLE_GROUP_KINDS],
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

  return (
    <AdminPageContainer>
      <Page.Vertical align="stretch" gap="xl">
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
                    <div className="flex justify-end">
                      <Button
                        label={t`Add credits`}
                        icon={Plus}
                        size="sm"
                        variant="outline"
                        onClick={() => setShowBuyCreditDialog(true)}
                      />
                    </div>
                  </AdminSectionAnchor>
                ) : null}
              </div>
            </div>
          }
          description={t`Control credit consumption across your workspace.`}
        />

        <Tabs
          value={usageTab}
          onValueChange={(v) =>
            setUsageTab(
              v === "groups" || v === "programmatic-usage" || v === "settings"
                ? v
                : "members"
            )
          }
          className="flex flex-col gap-4"
        >
          <TabsList>
            <TabsTrigger value="members" label={t`Members`} />
            <TabsTrigger value="groups" label={t`Groups`} />
            <TabsTrigger
              value="programmatic-usage"
              label={t`Programmatic usage`}
            />
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
                  isWorkspaceAdmin && groupFilter ? (
                    <GroupModelTierPickerDropdown
                      owner={owner}
                      groupId={groupFilter}
                    />
                  ) : undefined
                }
                membersTable={
                  <MembersUsageTable
                    members={membersUsage}
                    isLoading={isMembersUsageLoading}
                    isRefreshing={isMembersUsageRefreshing}
                    showSeatAndCredits={false}
                    showSpendLimit={false}
                    showModelTiersColumn={isWorkspaceAdmin}
                    userModelTierSelectionByUserId={
                      userModelTierSelectionByUserId
                    }
                    userAllowedModelTiersByUserId={
                      userAllowedModelTiersByUserId
                    }
                    groupModelTiersByGroupId={groupModelTiersByGroupId}
                    workspaceAllowedModelTiers={workspaceAllowedModelTiers}
                    groupNameToId={groupNameToId}
                    modelTierDefinitionByName={modelTierDefinitionByName}
                    totalAllowedUsagePendingMemberIds={EMPTY_IDS}
                    seatChangePendingMemberIds={EMPTY_IDS}
                    isSeatBased={false}
                    onChangeSeat={NOOP_MEMBER_ACTION}
                    onRemoveSeat={NOOP_MEMBER_ACTION}
                    onEditSpendLimit={NOOP_MEMBER_ACTION}
                    onSetUserModelTier={handleSetUserModelTier}
                    pagination={pagination}
                    setPagination={setPagination}
                    totalRowCount={totalMembersUsage}
                    sorting={effectiveSorting}
                    setSorting={handleSetSorting}
                    showGroupsColumn={groups.length > 0}
                    enableSelection={false}
                  />
                }
              />
            </AdminSectionAnchor>
          </TabsContent>

          <TabsContent value="groups" className={TAB_CONTENT_CLASS}>
            <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.usage.groups}>
              <GroupsUsageTable
                owner={owner}
                showSpendLimitColumn={false}
                showModelTiersColumn={isWorkspaceAdmin}
                showSharedUsageLimitColumn={false}
                showSeatColumn={false}
              />
            </AdminSectionAnchor>
          </TabsContent>

          <TabsContent
            value="programmatic-usage"
            forceMount
            className={
              usageTab === "programmatic-usage" ? TAB_CONTENT_CLASS : "hidden"
            }
          >
            <LegacyProgrammaticUsagePanel
              isBuyCreditDialogOpen={showBuyCreditDialog}
              onBuyCreditDialogOpenChange={setShowBuyCreditDialog}
              disabled={usageTab !== "programmatic-usage"}
              showHeader={false}
            />
          </TabsContent>

          {isWorkspaceAdmin && (
            <TabsContent
              value="settings"
              forceMount
              className={usageTab === "settings" ? TAB_CONTENT_CLASS : "hidden"}
            >
              <AdminSectionAnchor
                sectionId={ADMIN_SECTION_IDS.usage.programmatic}
              >
                <div className="flex flex-col gap-8">
                  <UsageProgrammaticLimitCard owner={owner} />
                </div>
              </AdminSectionAnchor>
            </TabsContent>
          )}
        </Tabs>
      </Page.Vertical>
    </AdminPageContainer>
  );
}
