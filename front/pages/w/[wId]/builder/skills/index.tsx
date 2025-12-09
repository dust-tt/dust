import { Button, Page, PlusIcon } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Head from "next/head";
import { useState } from "react";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { SkillDetails } from "@app/components/skills/SkillDetails";
import { SkillsTable } from "@app/components/skills/SkillsTable";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { AppWideModeLayout } from "@app/components/sparkle/AppWideModeLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SKILL_ICON } from "@app/lib/skill";
import { useSkillConfigurations } from "@app/lib/swr/skill_configurations";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { SubscriptionType, UserType, WorkspaceType } from "@app/types";
import { isBuilder } from "@app/types";
import type { SkillConfigurationWithAuthorType } from "@app/types/skill_configuration";

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
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [skillConfiguration, setSkillConfiguration] =
    useState<SkillConfigurationWithAuthorType | null>(null);

  const { skillConfigurations } = useSkillConfigurations({
    workspaceId: owner.sId,
  });

  return (
    <>
      {!!skillConfiguration && (
        <SkillDetails
          skillConfiguration={skillConfiguration}
          onClose={() => setSkillConfiguration(null)}
        />
      )}
      <ConversationsNavigationProvider>
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
                <SkillsTable
                  skillsConfigurations={skillConfigurations}
                  setSkillConfiguration={setSkillConfiguration}
                />
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
