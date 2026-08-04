import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import type {
  AvailabilityFilter,
  SkillManagerTabType,
} from "@app/components/pages/builder/skills/utils";
import {
  AVAILABILITY_FILTER_OPTIONS,
  AVAILABILITY_QUERY_PARAMS,
  filterByAvailability,
  filterBySearch,
  getAvailabilityFilterLabel,
  isAvailabilityFilter,
  isValidTab,
  SKILL_MANAGER_TABS,
  sortSkillsByName,
} from "@app/components/pages/builder/skills/utils";
import { ImportSkillsDialog } from "@app/components/skills/import/ImportSkillsDialog";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import type { BatchAvailabilityAction } from "@app/components/skills/SkillsBatchEdit";
import { BatchAvailabilityDialog } from "@app/components/skills/SkillsBatchEdit";
import {
  isSkillSelectable,
  SkillsTable,
} from "@app/components/skills/SkillsTable";
import { SuggestedSkillsSection } from "@app/components/skills/SuggestedSkillsSection";
import {
  useSetContentWidth,
  useSetNavChildren,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { SKILL_ICON } from "@app/lib/skill";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import {
  useSkillsWithRelations,
  useUpdateSkillFavorite,
  useUpdateSkillsAvailability,
} from "@app/lib/swr/skill_configurations";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
import { isEmptyString } from "@app/types/shared/utils/general";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  EmptyCTAButton,
  FolderOpen,
  InfoCircle,
  Page,
  Plus,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
} from "@dust-tt/sparkle";
import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function ManageSkillsPage() {
  const owner = useWorkspace();
  const { user, isAdmin } = useAuth();
  const { hasPermission } = useWorkspacePermissions();
  const [selectedSkillOverride, setSelectedSkillOverride] = useState<
    GetSkillsWithRelationsResponseBody["skills"][number] | null
  >(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "active");
  const [skillSearch, setSkillSearch] = useState("");
  const [skillIdParam, setSkillIdParam] = useHashParam("skillId");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pendingBatchAction, setPendingBatchAction] =
    useState<BatchAvailabilityAction | null>(null);
  const [bypassEditorVisibility, setBypassEditorVisibility] = useState(false);
  const { availability: availabilityParam } = useQueryParams(
    AVAILABILITY_QUERY_PARAMS
  );
  const availabilityFilter = isAvailabilityFilter(availabilityParam.value)
    ? availabilityParam.value
    : "all";
  // Clear the param on "all" so the default state keeps the URL clean.
  const setAvailabilityFilter = (value: AvailabilityFilter) =>
    availabilityParam.setParam(value === "all" ? undefined : value);

  // Switching tabs resets the availability filter to avoid carrying it across lists.
  const handleTabChange = (tabId: SkillManagerTabType) => {
    setSelectedTab(tabId);
    setAvailabilityFilter("all");
  };

  const handleShowHiddenChange = (checked: boolean) => {
    setBypassEditorVisibility(checked);
    setAvailabilityFilter(checked ? "editors" : "all");
  };

  const doUpdateAvailability = useUpdateSkillsAvailability({ owner });
  const { updateSkillFavorite } = useUpdateSkillFavorite({ owner });

  const isSearchActive = !isEmptyString(skillSearch);
  const isFilterActive = isSearchActive || availabilityFilter !== "all";

  const activeTab = useMemo<SkillManagerTabType>(() => {
    if (
      selectedTab &&
      isValidTab(selectedTab) &&
      SKILL_MANAGER_TABS.some((t) => t.id === selectedTab)
    ) {
      return selectedTab;
    }
    return "active";
  }, [selectedTab]);

  // The selection is scoped to the current tab/search/filter combination: a skill that drops
  // out of view (tab switch, search, or filter change) should drop out of the selection too.
  const selectionScopeKey = [activeTab, skillSearch, availabilityFilter].join(
    "|"
  );
  const [prevSelectionScopeKey, setPrevSelectionScopeKey] =
    useState(selectionScopeKey);
  if (selectionScopeKey !== prevSelectionScopeKey) {
    setPrevSelectionScopeKey(selectionScopeKey);
    setRowSelection({});
  }

  const canCreateSkill = hasPermission("create", "skill");

  const canBypassEditorVisibility = isAdmin;
  const isBypassEditorVisibilityEnabled =
    canBypassEditorVisibility && bypassEditorVisibility;

  const {
    skillsWithRelations: activeSkills,
    isSkillsWithRelationsLoading: isActiveLoading,
  } = useSkillsWithRelations({
    owner,
    status: "active",
    bypassEditorVisibility: isBypassEditorVisibilityEnabled,
    withMessageCount: true,
  });

  const {
    skillsWithRelations: archivedSkills,
    isSkillsWithRelationsLoading: isArchivedLoading,
  } = useSkillsWithRelations({
    owner,
    status: "archived",
    disabled: selectedTab !== "archived",
    bypassEditorVisibility: isBypassEditorVisibilityEnabled,
    withMessageCount: true,
  });

  const {
    skillsWithRelations: suggestedSkills,
    isSkillsWithRelationsLoading: isSuggestedLoading,
  } = useSkillsWithRelations({
    owner,
    status: "suggested",
    // Suggestions are only ever listed to users who can create skills, since
    // adopting one means becoming its editor.
    disabled: activeTab !== "active" || !canCreateSkill,
  });

  const sortedActiveSkills = useMemo(
    () => sortSkillsByName(activeSkills),
    [activeSkills]
  );
  const sortedArchivedSkills = useMemo(
    () => sortSkillsByName(archivedSkills),
    [archivedSkills]
  );

  const skillsByTab = useMemo<
    Record<SkillManagerTabType, GetSkillsWithRelationsResponseBody["skills"]>
  >(() => {
    const searchLower = skillSearch.toLowerCase();
    const editableByMeSkills = sortedActiveSkills.filter((s) =>
      s.relations.editors?.some((e) => e.sId === user?.sId)
    );
    const favoriteSkills = sortSkillsByName(
      activeSkills.filter((s) => s.isFavorite)
    );

    return {
      active: filterBySearch(
        filterByAvailability(sortedActiveSkills, availabilityFilter),
        searchLower,
        isSearchActive
      ),
      editable_by_me: filterBySearch(
        filterByAvailability(editableByMeSkills, availabilityFilter),
        searchLower,
        isSearchActive
      ),
      favorites: filterBySearch(
        filterByAvailability(favoriteSkills, availabilityFilter),
        searchLower,
        isSearchActive
      ),
      archived: filterBySearch(
        filterByAvailability(sortedArchivedSkills, availabilityFilter),
        searchLower,
        isSearchActive
      ),
    };
  }, [
    sortedActiveSkills,
    sortedArchivedSkills,
    activeSkills,
    skillSearch,
    user,
    isSearchActive,
    availabilityFilter,
  ]);

  const isLoading = isActiveLoading || isArchivedLoading || isSuggestedLoading;

  const handleSkillSelect = useCallback(
    (skill: GetSkillsWithRelationsResponseBody["skills"][number] | null) => {
      setSelectedSkillOverride(skill);
      setSkillIdParam(skill?.sId);
    },
    [setSkillIdParam]
  );

  const [isBatchUpdating, setIsBatchUpdating] = useState(false);

  const isBatchEditionAvailable =
    hasPermission("publish", "skill") && activeTab !== "archived";

  const canMakeSkillAutoDiscoverable = hasPermission(
    "make_discoverable",
    "skill"
  );

  // Only skills that are still selectable in the current tab can end up in bulk actions,
  // even if `rowSelection` (not reset on every scope change) still references a skill that
  // is no longer selectable in the current view.
  const selectedSkills = useMemo(
    () =>
      skillsByTab[activeTab].filter(
        (skill) =>
          rowSelection[skill.sId] &&
          isSkillSelectable(skill, canMakeSkillAutoDiscoverable)
      ),
    [skillsByTab, activeTab, rowSelection, canMakeSkillAutoDiscoverable]
  );
  const selectedSkillIds = useMemo(
    () => selectedSkills.map((skill) => skill.sId),
    [selectedSkills]
  );

  const handleBatchAvailability = async (availability: SkillAvailability) => {
    if (selectedSkillIds.length === 0 || isBatchUpdating) {
      return;
    }
    setIsBatchUpdating(true);
    try {
      const success = await doUpdateAvailability(
        selectedSkillIds,
        availability
      );
      if (success) {
        setRowSelection({});
      }
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const handleFavoriteChange = useCallback(
    async (
      skill: GetSkillsWithRelationsResponseBody["skills"][number],
      isFavorite: boolean
    ) => {
      const didUpdate = await updateSkillFavorite(skill, isFavorite);
      if (didUpdate) {
        setSelectedSkillOverride((currentSkill) =>
          currentSkill?.sId === skill.sId
            ? { ...currentSkill, isFavorite }
            : currentSkill
        );
      }
    },
    [updateSkillFavorite]
  );

  const knownSkillsById = useMemo(
    () =>
      new Map(
        [...activeSkills, ...archivedSkills, ...suggestedSkills].map(
          (skill) => [skill.sId, skill]
        )
      ),
    [activeSkills, archivedSkills, suggestedSkills]
  );

  const selectedSkill = useMemo(() => {
    if (!skillIdParam) {
      return null;
    }

    if (selectedSkillOverride?.sId === skillIdParam) {
      return selectedSkillOverride;
    }

    return knownSkillsById.get(skillIdParam) ?? null;
  }, [skillIdParam, knownSkillsById, selectedSkillOverride]);

  const handleUsedBySkillSelect = useCallback(
    (skillId: string) => {
      const skill = knownSkillsById.get(skillId);
      if (skill) {
        handleSkillSelect(skill);
      } else {
        setSelectedSkillOverride(null);
        setSkillIdParam(skillId);
      }
    },
    [handleSkillSelect, knownSkillsById, setSkillIdParam]
  );

  const searchBarRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    if (searchBarRef.current) {
      searchBarRef.current.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchBarRef.current]);

  useEffect(() => {
    if (isImportDialogOpen) {
      return;
    }

    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === "/") {
        event.preventDefault();
        searchBarRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [isImportDialogOpen]);

  const navChildren = useMemo(
    () => <AgentSidebarMenu owner={owner} />,
    [owner]
  );

  useSetContentWidth("wide");
  useSetPageTitle("Dust - Manage Skills");
  useSetNavChildren(navChildren);

  const isActiveTabEmpty = skillsByTab[activeTab].length === 0;

  const renderEmptyTabState = () => {
    if (isFilterActive) {
      return (
        <EmptyCTA
          message="No skill matches your search or filters."
          action={null}
        />
      );
    }
    // Nothing to create into from the archived tab.
    if (activeTab === "archived" || !canCreateSkill) {
      return null;
    }
    return (
      <EmptyCTA
        action={
          <EmptyCTAButton
            label="Create a skill"
            icon={Plus}
            variant="primary"
            href={getSkillBuilderRoute(owner.sId, "new")}
          />
        }
      />
    );
  };

  return (
    <>
      <SkillDetailsSheet
        skill={selectedSkill}
        onClose={() => handleSkillSelect(null)}
        onFavoriteChange={handleFavoriteChange}
        user={user}
        owner={owner}
      />
      <AgentDetailsSheet
        owner={owner}
        user={user}
        agentId={agentId}
        onClose={() => setAgentId(null)}
      />
      {isImportDialogOpen && (
        <ImportSkillsDialog
          onClose={() => setIsImportDialogOpen(false)}
          owner={owner}
        />
      )}
      {pendingBatchAction && (
        <BatchAvailabilityDialog
          action={pendingBatchAction}
          selectedCount={selectedSkillIds.length}
          isUpdating={isBatchUpdating}
          onConfirm={async () => {
            await handleBatchAvailability(pendingBatchAction.availability);
            setPendingBatchAction(null);
          }}
          onCancel={() => setPendingBatchAction(null)}
        />
      )}
      <div className="flex w-full flex-col gap-8 pb-4">
        <Page.Header
          title="Manage Skills"
          description="Reusable packages of instructions and tools that agents can share."
          noTopPadding
        />
        <Page.Vertical gap="md" align="stretch">
          <div className="flex flex-row gap-2">
            <SearchInput
              ref={searchBarRef}
              className="flex-grow"
              name="search"
              placeholder="Search (Name, Editors)"
              value={skillSearch}
              onChange={(s) => {
                setSkillSearch(s);
              }}
            />
            {canCreateSkill && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button label="Create skill" icon={Plus} isSelect />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    label="From scratch"
                    icon={SKILL_ICON}
                    href={getSkillBuilderRoute(owner.sId, "new")}
                  />
                  <DropdownMenuItem
                    label="From existing"
                    icon={FolderOpen}
                    onClick={() => setIsImportDialogOpen(true)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex flex-col pt-3">
            <Tabs value={activeTab}>
              <TabsList>
                {SKILL_MANAGER_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    label={tab.label}
                    onClick={() => handleTabChange(tab.id)}
                    tooltip={tab.description}
                    isCounter={tab.id !== "archived"}
                    counterValue={`${skillsByTab[tab.id].length}`}
                  />
                ))}
                <div className="ml-auto flex flex-row items-center gap-3 self-center text-sm text-muted-foreground">
                  {canBypassEditorVisibility && (
                    <span className="flex gap-1">
                      <label className="flex cursor-pointer flex-row items-center gap-2 whitespace-nowrap">
                        <Checkbox
                          checked={bypassEditorVisibility}
                          onCheckedChange={(checked) =>
                            handleShowHiddenChange(checked === true)
                          }
                        />
                        Show hidden skills
                      </label>
                      <Tooltip
                        label="Shows skills you can access as an admin, even if you’re not an editor"
                        trigger={
                          <InfoCircle className="h-4 w-4 text-muted-foreground" />
                        }
                      />
                    </span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        isSelect
                        className="w-44 justify-between"
                        label={getAvailabilityFilterLabel(availabilityFilter)}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      {AVAILABILITY_FILTER_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          label={option.label}
                          onClick={() => setAvailabilityFilter(option.value)}
                        />
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TabsList>
            </Tabs>
            {!isLoading &&
              activeTab === "active" &&
              availabilityFilter === "all" &&
              suggestedSkills.length > 0 && (
                <SuggestedSkillsSection
                  skills={sortSkillsByName(suggestedSkills)}
                  onSkillClick={handleSkillSelect}
                  owner={owner}
                  user={user}
                />
              )}
            {isLoading || !isActiveTabEmpty ? (
              <SkillsTable
                owner={owner}
                skills={skillsByTab[activeTab]}
                onSkillClick={handleSkillSelect}
                onAgentClick={setAgentId}
                onUsedBySkillClick={handleUsedBySkillSelect}
                canMakeSkillAutoDiscoverable={canMakeSkillAutoDiscoverable}
                enableSelection={isBatchEditionAvailable}
                rowSelection={rowSelection}
                setRowSelection={setRowSelection}
                isBatchUpdating={isBatchUpdating}
                onSelectAvailabilityAction={setPendingBatchAction}
                isLoading={isLoading}
              />
            ) : (
              <div className="pt-2">{renderEmptyTabState()}</div>
            )}
          </div>
        </Page.Vertical>
      </div>
    </>
  );
}
