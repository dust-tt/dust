import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { ImportSkillsDialog } from "@app/components/skills/import/ImportSkillsDialog";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import type { BatchAvailabilityAction } from "@app/components/skills/SkillsBatchEdit";
import {
  BatchAvailabilityDialog,
  SkillsBatchEditBar,
} from "@app/components/skills/SkillsBatchEdit";
import {
  SKILL_AVAILABILITY_DISPLAY,
  SkillsTable,
} from "@app/components/skills/SkillsTable";
import { SuggestedSkillsSection } from "@app/components/skills/SuggestedSkillsSection";
import {
  useSetContentWidth,
  useSetNavChildren,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { useHashParam } from "@app/hooks/useHashParams";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { isDustProvidedSkill, SKILL_ICON } from "@app/lib/skill";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import {
  useSkillsWithRelations,
  useUpdateSkillsAvailability,
} from "@app/lib/swr/skill_configurations";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import {
  SKILL_AVAILABILITIES,
  type SkillAvailability,
  type SkillWithoutInstructionsAndToolsWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import { isEmptyString } from "@app/types/shared/utils/general";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FolderOpen,
  InfoCircle,
  ListSelect,
  Page,
  Plus,
  SearchInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
} from "@dust-tt/sparkle";
import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SkillManagerTabType =
  | "active"
  | "editable_by_me"
  | "default"
  | "archived"
  | SkillAvailability;

interface SkillManagerTab {
  id: SkillManagerTabType;
  label: string;
  description: string;
}

const ALL_SKILLS_TAB: SkillManagerTab = {
  id: "active",
  label: "All",
  description: "All active skills",
};

const ARCHIVED_TAB: SkillManagerTab = {
  id: "archived",
  label: "Archived",
  description: "Archived skills",
};

// With skill publication governance, active skills are split by availability so each publication
// level gets its own tab. The labels/tooltips mirror the availability chips shown in the table.
const GOVERNANCE_SKILL_MANAGER_TABS: SkillManagerTab[] = [
  ALL_SKILLS_TAB,
  ...SKILL_AVAILABILITIES.map((availability) => ({
    id: availability,
    label: SKILL_AVAILABILITY_DISPLAY[availability].label,
    description: SKILL_AVAILABILITY_DISPLAY[availability].tooltip,
  })),
  ARCHIVED_TAB,
];

const LEGACY_SKILL_MANAGER_TABS: SkillManagerTab[] = [
  ALL_SKILLS_TAB,
  {
    id: "editable_by_me",
    label: "Editable by me",
    description: "Skills you can edit",
  },
  {
    id: "default",
    label: "Default",
    description: "Default skills provided by Dust",
  },
  ARCHIVED_TAB,
];

const ALL_TAB_IDS: SkillManagerTabType[] = [
  "active",
  "editable_by_me",
  "default",
  "archived",
  ...SKILL_AVAILABILITIES,
];

function isValidTab(tab: string): tab is SkillManagerTabType {
  return ALL_TAB_IDS.some((id) => id === tab);
}

function getSkillSearchString(
  skill: SkillWithoutInstructionsAndToolsWithRelationsType
): string {
  const skillEditorNames =
    skill.relations.editors?.map((e) => e.fullName) ?? [];
  return [skill.name].concat(skillEditorNames).join(" ").toLowerCase();
}

function sortSkillsByName(
  skills: SkillWithoutInstructionsAndToolsWithRelationsType[]
) {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name));
}

export function ManageSkillsPage() {
  const owner = useWorkspace();
  const { user, isAdmin } = useAuth();
  const { hasPermission } = useWorkspacePermissions();
  const { hasFeature } = useFeatureFlags();
  const [selectedSkill, setSelectedSkill] =
    useState<SkillWithoutInstructionsAndToolsWithRelationsType | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "active");
  const [skillSearch, setSkillSearch] = useState("");
  const [skillIdParam, setSkillIdParam] = useHashParam("skillId");
  const [isBatchEditing, setIsBatchEditing] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pendingBatchAction, setPendingBatchAction] =
    useState<BatchAvailabilityAction | null>(null);
  const [bypassEditorVisibility, setBypassEditorVisibility] = useState(false);

  const hasSkillPublicationGovernance = hasFeature(
    "admin_governance_skill_publication"
  );
  const doUpdateAvailability = useUpdateSkillsAvailability({ owner });

  const isSearchActive = !isEmptyString(skillSearch);

  const visibleTabs = useMemo(
    () =>
      hasSkillPublicationGovernance
        ? GOVERNANCE_SKILL_MANAGER_TABS
        : LEGACY_SKILL_MANAGER_TABS,
    [hasSkillPublicationGovernance]
  );

  const activeTab = useMemo<SkillManagerTabType>(() => {
    if (
      selectedTab &&
      isValidTab(selectedTab) &&
      visibleTabs.some((t) => t.id === selectedTab)
    ) {
      return selectedTab;
    }
    return "active";
  }, [selectedTab, visibleTabs]);

  const canBypassEditorVisibility = isAdmin && hasSkillPublicationGovernance;
  const effectiveBypassEditorVisibility =
    canBypassEditorVisibility && bypassEditorVisibility;

  const {
    skillsWithRelations: activeSkills,
    isSkillsWithRelationsLoading: isActiveLoading,
  } = useSkillsWithRelations({
    owner,
    status: "active",
    bypassEditorVisibility: effectiveBypassEditorVisibility,
  });

  const {
    skillsWithRelations: archivedSkills,
    isSkillsWithRelationsLoading: isArchivedLoading,
  } = useSkillsWithRelations({
    owner,
    status: "archived",
    disabled: selectedTab !== "archived",
    bypassEditorVisibility: effectiveBypassEditorVisibility,
  });

  const {
    skillsWithRelations: suggestedSkills,
    isSkillsWithRelationsLoading: isSuggestedLoading,
  } = useSkillsWithRelations({
    owner,
    status: "suggested",
    disabled: activeTab !== "active",
  });

  const skillsByTab = useMemo<
    Record<
      SkillManagerTabType,
      SkillWithoutInstructionsAndToolsWithRelationsType[]
    >
  >(() => {
    const sortedActiveSkills = sortSkillsByName(activeSkills);
    const sortedArchivedSkills = sortSkillsByName(archivedSkills);

    const searchLower = skillSearch.toLowerCase();
    const filteredList = (
      skills: SkillWithoutInstructionsAndToolsWithRelationsType[]
    ) => {
      if (!isSearchActive) {
        return skills;
      }
      return skills
        .filter((s) => subFilter(searchLower, getSkillSearchString(s)))
        .sort((a, b) =>
          compareForFuzzySort(
            searchLower,
            getSkillSearchString(a),
            getSkillSearchString(b)
          )
        );
    };

    // Display Dust-managed skills first, then fall back to a name sort.
    const sortDustProvidedFirst = (
      skills: SkillWithoutInstructionsAndToolsWithRelationsType[]
    ) =>
      [...skills].sort((a, b) => {
        const aIsDustProvided = isDustProvidedSkill(a);
        const bIsDustProvided = isDustProvidedSkill(b);
        if (aIsDustProvided !== bIsDustProvided) {
          return aIsDustProvided ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

    const byAvailability = (availability: SkillAvailability) =>
      filteredList(
        sortedActiveSkills.filter((s) => s.availability === availability)
      );

    return {
      active: filteredList(sortedActiveSkills),
      editable_by_me: filteredList(
        sortedActiveSkills.filter((s) =>
          s.relations.editors?.some((e) => e.sId === user?.sId)
        )
      ),
      // Legacy (no governance) tab: auto-discoverable skills plus Dust-provided ones.
      default: filteredList(
        sortDustProvidedFirst(
          sortedActiveSkills.filter(
            (s) =>
              s.availability === "users_and_agents" || isDustProvidedSkill(s)
          )
        )
      ),
      editors: byAvailability("editors"),
      workspace_users: byAvailability("workspace_users"),
      users_and_agents: filteredList(
        sortDustProvidedFirst(
          sortedActiveSkills.filter(
            (s) => s.availability === "users_and_agents"
          )
        )
      ),
      archived: filteredList(sortedArchivedSkills),
    };
  }, [activeSkills, archivedSkills, skillSearch, user, isSearchActive]);

  const isLoading = isActiveLoading || isArchivedLoading || isSuggestedLoading;

  // Open skill from hash param when skills are loaded.
  useEffect(() => {
    if (skillIdParam && !isActiveLoading && activeSkills.length > 0) {
      const skillFromParam = activeSkills.find((s) => s.sId === skillIdParam);
      if (skillFromParam && selectedSkill?.sId !== skillIdParam) {
        setSelectedSkill(skillFromParam);
      }
    }
  }, [skillIdParam, activeSkills, isActiveLoading, selectedSkill?.sId]);

  const handleSkillSelect = useCallback(
    (skill: SkillWithoutInstructionsAndToolsWithRelationsType | null) => {
      setSelectedSkill(skill);
      setSkillIdParam(skill?.sId);
    },
    [setSkillIdParam]
  );

  const [isBatchUpdating, setIsBatchUpdating] = useState(false);

  const selectedSkillIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, selected]) => selected)
        .map(([sId]) => sId),
    [rowSelection]
  );

  const closeBatchEdition = () => {
    setIsBatchEditing(false);
    setRowSelection({});
  };

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

  const isBatchEditionAvailable =
    hasSkillPublicationGovernance &&
    hasPermission("publish", "skill") &&
    activeTab !== "archived";

  const canMakeSkillAutoDiscoverable = hasPermission(
    "make_discoverable",
    "skill"
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

  const handleUsedBySkillSelect = useCallback(
    (skillId: string) => {
      const skill = knownSkillsById.get(skillId);
      if (skill) {
        handleSkillSelect(skill);
      } else {
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

  return (
    <>
      <SkillDetailsSheet
        skill={selectedSkill}
        onClose={() => handleSkillSelect(null)}
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
          icon={SKILL_ICON}
          description="Reusable packages of instructions and tools that agents can share."
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
            {isBatchEditionAvailable && !isBatchEditing && (
              <Button
                variant="outline"
                label="Batch edit"
                icon={ListSelect}
                onClick={() => setIsBatchEditing(true)}
              />
            )}
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
          </div>
          {isBatchEditionAvailable && isBatchEditing && (
            <SkillsBatchEditBar
              selectedCount={selectedSkillIds.length}
              isUpdating={isBatchUpdating}
              canMakeSkillAutoDiscoverable={canMakeSkillAutoDiscoverable}
              onClose={closeBatchEdition}
              onSelectAction={setPendingBatchAction}
            />
          )}
          <div className="flex flex-col pt-3">
            <Tabs value={activeTab}>
              <TabsList>
                {visibleTabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    label={tab.label}
                    onClick={() => setSelectedTab(tab.id)}
                    tooltip={tab.description}
                    isCounter={tab.id !== "archived"}
                    counterValue={`${skillsByTab[tab.id].length}`}
                  />
                ))}
                {canBypassEditorVisibility && (
                  <div className="ml-auto flex flex-row items-center gap-2 self-center text-sm text-muted-foreground">
                    <label className="flex cursor-pointer flex-row items-center gap-2 whitespace-nowrap">
                      <Checkbox
                        checked={bypassEditorVisibility}
                        onCheckedChange={(checked) =>
                          setBypassEditorVisibility(checked === true)
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
                  </div>
                )}
              </TabsList>
            </Tabs>
            {isLoading ? (
              <div className="mt-8 flex justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <>
                {activeTab === "active" && suggestedSkills.length > 0 && (
                  <SuggestedSkillsSection
                    skills={sortSkillsByName(suggestedSkills)}
                    onSkillClick={handleSkillSelect}
                    owner={owner}
                    user={user}
                  />
                )}
                <SkillsTable
                  owner={owner}
                  skills={skillsByTab[activeTab]}
                  onSkillClick={handleSkillSelect}
                  onAgentClick={setAgentId}
                  onUsedBySkillClick={handleUsedBySkillSelect}
                  showAvailability={hasSkillPublicationGovernance}
                  canMakeSkillAutoDiscoverable={canMakeSkillAutoDiscoverable}
                  {...(isBatchEditionAvailable && isBatchEditing
                    ? { rowSelection, setRowSelection }
                    : {})}
                />
              </>
            )}
          </div>
        </Page.Vertical>
      </div>
    </>
  );
}
