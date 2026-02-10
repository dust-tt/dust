import {
  Button,
  MagnifyingGlassIcon,
  Page,
  PlusIcon,
  SearchInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetails } from "@app/components/assistant/details/AgentDetails";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import { SkillsTable } from "@app/components/skills/SkillsTable";
import { SuggestedSkillsSection } from "@app/components/skills/SuggestedSkillsSection";
import { useAppLayoutConfig } from "@app/components/sparkle/AppLayoutContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { Head } from "@app/lib/platform";
import { SKILL_ICON } from "@app/lib/skill";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";
import { isEmptyString } from "@app/types/shared/utils/general";

const SKILL_SEARCH_TAB = {
  id: "search",
  label: "Searching across all skills",
  icon: MagnifyingGlassIcon,
  description: "Searching across all skills.",
} as const;

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

function getSkillSearchString(skill: SkillWithRelationsType): string {
  const skillEditorNames =
    skill.relations.editors?.map((e) => e.fullName) ?? [];
  return [skill.name].concat(skillEditorNames).join(" ").toLowerCase();
}

function sortSkillsByName(skills: SkillWithRelationsType[]) {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name));
}

export function ManageSkillsPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const [selectedSkill, setSelectedSkill] =
    useState<SkillWithRelationsType | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "active");
  const [skillSearch, setSkillSearch] = useState("");
  const [skillIdParam, setSkillIdParam] = useHashParam("skillId");

  const activeTab = useMemo(() => {
    if (!isEmptyString(skillSearch)) {
      return "search";
    }
    if (selectedTab && isValidTab(selectedTab)) {
      return selectedTab;
    }
    return "active";
  }, [selectedTab, skillSearch]);

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
    disabled: activeTab !== "archived",
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

    return {
      active: sortedActiveSkills,
      editable_by_me: sortedActiveSkills.filter((s) => s.canWrite),
      default: sortedActiveSkills.filter((s) => !s.relations.editors),
      archived: sortedArchivedSkills,
      search: activeSkills
        .filter((s) =>
          subFilter(skillSearch.toLowerCase(), getSkillSearchString(s))
        )
        .sort((a, b) =>
          compareForFuzzySort(
            skillSearch.toLowerCase(),
            getSkillSearchString(a),
            getSkillSearchString(b)
          )
        ),
    };
  }, [activeSkills, archivedSkills, skillSearch]);

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
    (skill: SkillWithRelationsType | null) => {
      setSelectedSkill(skill);
      setSkillIdParam(skill?.sId);
    },
    [setSkillIdParam]
  );

  const visibleTabs = useMemo(() => {
    return !isEmptyString(skillSearch)
      ? [SKILL_SEARCH_TAB]
      : SKILL_MANAGER_TABS;
  }, [skillSearch]);

  const searchBarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchBarRef.current) {
      searchBarRef.current.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchBarRef.current]);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === "/") {
        event.preventDefault();
        if (searchBarRef.current) {
          searchBarRef.current.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, []);

  useAppLayoutConfig(
    () => ({
      contentWidth: "wide",
      navChildren: <AgentSidebarMenu owner={owner} />,
    }),
    [owner]
  );

  return (
    <>
      <SkillDetailsSheet
        skill={selectedSkill}
        onClose={() => handleSkillSelect(null)}
        user={user}
        owner={owner}
      />
      <AgentDetails
        owner={owner}
        user={user}
        agentId={agentId}
        onClose={() => setAgentId(null)}
      />
      <Head>
        <title>Dust - Manage Skills</title>
      </Head>
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
            <Button
              label="Create skill"
              href={getSkillBuilderRoute(owner.sId, "new")}
              icon={PlusIcon}
              tooltip="Create a new skill"
            />
          </div>
          <div className="flex flex-col pt-3">
            <Tabs value={activeTab}>
              <TabsList>
                {visibleTabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    label={tab.label}
                    onClick={() => !skillSearch && setSelectedTab(tab.id)}
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
                />
              </>
            )}
          </div>
        </Page.Vertical>
      </div>
    </>
  );
}
