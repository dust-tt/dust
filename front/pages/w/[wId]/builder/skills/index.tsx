import {
  Button,
  Page,
  PlusIcon,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Head from "next/head";
import { useMemo, useState } from "react";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
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
import { useSkillConfigurationsWithRelations } from "@app/lib/swr/skill_configurations";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { SubscriptionType, UserType, WorkspaceType } from "@app/types";
import { isBuilder } from "@app/types";
import type {
  SkillConfigurationRelations,
  SkillConfigurationType,
} from "@app/types/assistant/skill_configuration";

export const SKILL_MANAGER_TABS = [
  {
    id: "active",
    label: "All",
    description: "All active skills.",
  },
  {
    id: "archived",
    label: "Archived",
    description: "Archived skills.",
  },
] as const;

export type SkillManagerTabsType = (typeof SKILL_MANAGER_TABS)[number]["id"];

function isValidTab(tab: string): tab is SkillManagerTabsType {
  return SKILL_MANAGER_TABS.map((tab) => tab.id).includes(
    tab as SkillManagerTabsType
  );
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
  const [selectedSkill, setSelectedSkill] = useState<
    (SkillConfigurationType & SkillConfigurationRelations) | null
  >(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "active");

  const activeTab = useMemo(() => {
    return selectedTab && isValidTab(selectedTab) ? selectedTab : "active";
  }, [selectedTab]);

  const {
    skillConfigurationsWithRelations,
    isSkillConfigurationsWithRelationsLoading,
  } = useSkillConfigurationsWithRelations({
    owner,
    status: activeTab,
  });

  return (
    <>
      {!!selectedSkill && (
        <SkillDetailsSheet
          skillConfiguration={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          user={user}
          owner={owner}
        />
      )}
      <ConversationsNavigationProvider>
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
              <div className="flex justify-end">
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
                    {SKILL_MANAGER_TABS.map((tab) => (
                      <TabsTrigger
                        key={tab.id}
                        value={tab.id}
                        label={tab.label}
                        onClick={() => setSelectedTab(tab.id)}
                        tooltip={tab.description}
                        isCounter={tab.id !== "archived"}
                        counterValue={
                          tab.id === activeTab
                            ? `${skillConfigurationsWithRelations.length}`
                            : undefined
                        }
                      />
                    ))}
                  </TabsList>
                </Tabs>
                {isSkillConfigurationsWithRelationsLoading ? (
                  <div className="mt-8 flex justify-center">
                    <Spinner size="lg" />
                  </div>
                ) : (
                  <SkillsTable
                    owner={owner}
                    skills={skillConfigurationsWithRelations}
                    onSkillClick={setSelectedSkill}
                    onAgentClick={setAgentId}
                  />
                )}
              </div>
            </Page.Vertical>
          </div>
        </AppWideModeLayout>
      </ConversationsNavigationProvider>
    </>
  );
}

WorkspaceSkills.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
