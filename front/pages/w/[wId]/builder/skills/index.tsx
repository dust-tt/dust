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
import type { InferGetServerSidePropsType } from "next";
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetails } from "@app/components/assistant/details/AgentDetails";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import { SkillsTable } from "@app/components/skills/SkillsTable";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { AppWideModeLayout } from "@app/components/sparkle/AppWideModeLayout";
import { useHashParam } from "@app/hooks/useHashParams";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SKILL_ICON } from "@app/lib/skill";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { SubscriptionType, UserType, WorkspaceType } from "@app/types";
import { isBuilder, isEmptyString } from "@app/types";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";

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

type SkillManagerTabType = (typeof SKILL_MANAGER_TABS)[number]["id"];

function isValidTab(tab: string): tab is SkillManagerTabType {
  return SKILL_MANAGER_TABS.some((t) => t.id === tab);
}

function getSkillSearchString(skill: SkillWithRelationsType): string {
  const skillEditorNames =
    skill.relations.editors?.map((e) => e.fullName) ?? [];
  return [skill.name].concat(skillEditorNames).join(" ").toLowerCase();
}

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
}>(async (_, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("skills") || !isBuilder(owner)) {
    return {
      notFound: true,
    };
  }

  const user = auth.getNonNullableUser();

  return {
    props: {
      owner,
      subscription,
      user: user.toJSON(),
    },
  };
});

export default function WorkspaceSkills({
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [selectedSkill, setSelectedSkill] =
    useState<SkillWithRelationsType | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "active");
  const [skillSearch, setSkillSearch] = useState("");

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
    skillConfigurationsWithRelations: activeSkills,
    isSkillConfigurationsWithRelationsLoading: isActiveLoading,
  } = useSkillsWithRelations({
    owner,
    status: "active",
  });

  const {
    skillConfigurationsWithRelations: archivedSkills,
    isSkillConfigurationsWithRelationsLoading: isArchivedLoading,
  } = useSkillsWithRelations({
    owner,
    status: "archived",
    disabled: activeTab !== "archived",
  });

  const skillsByTab = useMemo(
    () => ({
      active: activeSkills,
      editable_by_me: activeSkills.filter((s) => s.canWrite),
      default: activeSkills.filter((s) => !s.relations.editors),
      archived: archivedSkills,
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
    }),
    [activeSkills, archivedSkills, skillSearch]
  );

  const isLoading = isActiveLoading || isArchivedLoading;

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

  return (
    <>
      {!!selectedSkill && (
        <SkillDetailsSheet
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          user={user}
          owner={owner}
        />
      )}

      <AgentDetails
        owner={owner}
        user={user}
        agentId={agentId}
        onClose={() => setAgentId(null)}
      />
      <AppWideModeLayout
        subscription={subscription}
        owner={owner}
        navChildren={<AgentSidebarMenu owner={owner} />}
      >
        <Head>
          <title>Dust - Manage Skills</title>
        </Head>
        <div className="flex w-full flex-col gap-8 pt-2 lg:pt-8">
          <Page.Header title="Manage Skills" icon={SKILL_ICON} />
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
                <SkillsTable
                  owner={owner}
                  skills={skillsByTab[activeTab]}
                  onSkillClick={setSelectedSkill}
                  onAgentClick={setAgentId}
                />
              )}
            </div>
          </Page.Vertical>
        </div>
      </AppWideModeLayout>
    </>
  );
}

WorkspaceSkills.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
