import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { Providers } from "@app/components/pages/workspace/developers/ProvidersPage";
import { ModelProvidersPageContent } from "@app/components/pages/workspace/model_providers/ModelProvidersPageContent";
import { GroupModelTierPickerDropdown } from "@app/components/workspace/GroupModelTierPickerDropdown";
import { GroupsUsageTable } from "@app/components/workspace/GroupsUsageTable";
import { MembersUsageTable } from "@app/components/workspace/MembersUsageTable";
import { ModelTiersSettingsCard } from "@app/components/workspace/usage/ModelTiersSettingsCard";
import { UsageMembersSection } from "@app/components/workspace/UsageMembersSection";
import { useAdminPageTab } from "@app/hooks/useAdminPageTab";
import { useProvidersSelection } from "@app/hooks/useProvidersSelection";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
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
import { useWorkspace as useWorkspaceDetails } from "@app/lib/swr/workspaces";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";

import { isAdmin } from "@app/types/user";
import {
  Page,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

const MODELS_TABS = [
  "providers",
  "tiers",
  "members",
  "groups",
  "apps",
] as const;
type ModelsTab = (typeof MODELS_TABS)[number];

const DEFAULT_PAGE_SIZE = 25;
const EMPTY_IDS = new Set<string>();
const NOOP_MEMBER_ACTION = (_member: MemberUsageType) => {};

// Keep every tab panel at least as tall as the scrolling panel so switching to a
// shorter (or still loading) tab never shrinks the page and clamps the scroll offset.
// Sparkle renders TabsContent as `contents`, so `block` is required for the min-height to apply.
const TAB_CONTENT_CLASS = "block min-h-panel";

export function ModelsPage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const isWorkspaceAdmin = isAdmin(owner);
  const showApps = hasFeature("legacy_dust_apps");
  const { workspace, isWorkspaceValidating, mutateWorkspace } =
    useWorkspaceDetails({ owner });
  const { providersSelection, toggleProvider, selectAllProviders } =
    useProvidersSelection(workspace, owner, mutateWorkspace);

  const { tab, setTab } = useAdminPageTab<ModelsTab>(MODELS_TABS, "providers");
  const activeTab: ModelsTab = (() => {
    if (tab === "apps" && !showApps) {
      return "providers";
    }
    return tab;
  })();

  const [searchTerm, setSearchTerm] = useState("");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

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

  const { setUserAllowedModelTier, clearUserAllowedModelTier } =
    useUserAllowedModelTierMutations({ owner });
  const handleSetUserModelTiers = useCallback(
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
    disabled: activeTab !== "members" && activeTab !== "groups",
  });

  const { groups } = useGroups({
    owner,
    kinds: [...CAP_ELIGIBLE_GROUP_KINDS],
    disabled: activeTab !== "members" && activeTab !== "groups",
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

  if (!workspace) {
    return (
      <AdminPageContainer>
        <div className="flex h-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      </AdminPageContainer>
    );
  }

  return (
    <AdminPageContainer>
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header title={t`Models`} />
        <Tabs
          value={activeTab}
          onValueChange={(value: string) => setTab(value as ModelsTab)}
          className="flex flex-col gap-4"
        >
          <TabsList>
            <TabsTrigger value="providers" label={t`Providers`} />
            <TabsTrigger value="members" label={t`Members`} />
            <TabsTrigger value="groups" label={t`Groups`} />
            {showApps && (
              <TabsTrigger value="apps" label={t`App Credentials`} />
            )}
            <TabsTrigger value="tiers" label={t`Settings`} />
          </TabsList>
          <TabsContent value="providers" className="flex flex-col gap-4">
            <AdminSectionAnchor
              sectionId={ADMIN_SECTION_IDS.modelProviders.providers}
            >
              <ModelProvidersPageContent
                workspace={workspace}
                providersSelection={providersSelection}
                isWorkspaceValidating={isWorkspaceValidating}
                onToggleProvider={toggleProvider}
                onSelectAllProviders={selectAllProviders}
              />
            </AdminSectionAnchor>
          </TabsContent>
          <TabsContent value="tiers" className="flex flex-col gap-4">
            <AdminSectionAnchor
              sectionId={ADMIN_SECTION_IDS.modelProviders.tiers}
            >
              <ModelTiersSettingsCard owner={owner} />
            </AdminSectionAnchor>
          </TabsContent>
          <TabsContent value="members" className={TAB_CONTENT_CLASS}>
            <AdminSectionAnchor
              sectionId={ADMIN_SECTION_IDS.modelProviders.members}
            >
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
                    onSetUserModelTier={handleSetUserModelTiers}
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
            <AdminSectionAnchor
              sectionId={ADMIN_SECTION_IDS.modelProviders.groups}
            >
              <GroupsUsageTable
                owner={owner}
                showSpendLimitColumn={false}
                showModelTiersColumn={isWorkspaceAdmin}
                showSharedUsageLimitColumn={false}
              />
            </AdminSectionAnchor>
          </TabsContent>

          {showApps && (
            <TabsContent value="apps" className="flex flex-col gap-4">
              <AdminSectionAnchor
                sectionId={ADMIN_SECTION_IDS.modelProviders.apps}
              >
                <Providers owner={owner} />
              </AdminSectionAnchor>
            </TabsContent>
          )}
        </Tabs>
      </Page.Vertical>
    </AdminPageContainer>
  );
}
