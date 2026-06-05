import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { ImportSkillsDialog } from "@app/components/skills/import/ImportSkillsDialog";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import { SkillsTable } from "@app/components/skills/SkillsTable";
import { SuggestedSkillsSection } from "@app/components/skills/SuggestedSkillsSection";
import {
  useSetContentWidth,
  useSetNavChildren,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { SKILL_ICON } from "@app/lib/skill";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { SkillWithoutInstructionsAndToolsWithRelationsType } from "@app/types/assistant/skill_configuration";
import { isEmptyString } from "@app/types/shared/utils/general";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FolderOpen,
  Page,
  Plus,
  SearchInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SKILL_MANAGER_TABS = [
  {
    id: "active",
    label: "All",
    description: "All active skills.",
  },
  {
    id: "editable_by_me",
    label: "Editable by me",
    description: "Skills you can edit.",
  },
  {
    id: "default",
    label: "Default",
    description: "Default skills provided by Dust.",
  },
  {
    id: "archived",
    label: "Archived",
    description: "Archived skills.",
  },
] as const;

export type SkillManagerTabType = (typeof SKILL_MANAGER_TABS)[number]["id"];

function isValidTab(tab: string): tab is SkillManagerTabType {
  return SKILL_MANAGER_TABS.some((t) => t.id === tab);
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
  const { user } = useAuth();
  const [selectedSkill, setSelectedSkill] =
    useState<SkillWithoutInstructionsAndToolsWithRelationsType | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "active");
  const [skillSearch, setSkillSearch] = useState("");
  const [skillIdParam, setSkillIdParam] = useHashParam("skillId");

  const isSearchActive = !isEmptyString(skillSearch);

  const activeTab = useMemo(() => {
    if (selectedTab && isValidTab(selectedTab)) {
      return selectedTab;
    }
    return "active";
  }, [selectedTab]);

  const {
    skillsWithRelations: activeSkills,
    isSkillsWithRelationsLoading: isActiveLoading,
  } = useSkillsWithRelations({
    owner,
    status: "active",
  });

  const {
    skillsWithRelations: archivedSkills,
    isSkillsWithRelationsLoading: isArchivedLoading,
  } = useSkillsWithRelations({
    owner,
    status: "archived",
    disabled: selectedTab !== "archived",
  });

  const {
    skillsWithRelations: suggestedSkills,
    isSkillsWithRelationsLoading: isSuggestedLoading,
  } = useSkillsWithRelations({
    owner,
    status: "suggested",
    disabled: activeTab !== "active",
  });

  const skillsByTab = useMemo(() => {
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

    return {
      active: filteredList(sortedActiveSkills),
      editable_by_me: filteredList(
        sortedActiveSkills.filter((s) =>
          s.relations.editors?.some((e) => e.sId === user?.sId)
        )
      ),
      default: filteredList(
        sortedActiveSkills
          .filter((s) => s.isDefault || s.relations.editors === null)
          .sort((a, b) => {
            // Display first the skills that have no editor (Dust-managed ones).
            const aNoEditors = a.relations.editors === null;
            const bNoEditors = b.relations.editors === null;
            if (aNoEditors !== bNoEditors) {
              return aNoEditors ? -1 : 1;
            }
            // Fallback to a name sort.
            return a.name.localeCompare(b.name);
          })
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
      <div className="flex w-full flex-col gap-8 pb-4 pt-2 lg:pt-8">
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
          <div className="flex flex-col pt-3">
            <Tabs value={activeTab}>
              <TabsList>
                {SKILL_MANAGER_TABS.map((tab) => (
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
                />
              </>
            )}
          </div>
        </Page.Vertical>
      </div>
    </>
  );
}
