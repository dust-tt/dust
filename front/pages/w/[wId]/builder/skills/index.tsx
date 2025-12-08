import { Page } from "@dust-tt/sparkle";
import { PuzzleIcon } from "lucide-react";
import type { InferGetServerSidePropsType } from "next";
import Head from "next/head";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { SkillsTable } from "@app/components/skills/SkillsTable";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { AppWideModeLayout } from "@app/components/sparkle/AppWideModeLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useSkillConfigurations } from "@app/lib/swr/skill_configurations";
import type { SubscriptionType, UserType, WorkspaceType } from "@app/types";

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
  if (!featureFlags.includes("skills")) {
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
  const { skillConfigurations } = useSkillConfigurations({
    workspaceId: owner.sId,
  });

  return (
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
          {/* TODO(skills 2025-12-05): use the right icon */}
          <Page.Header title="Manage Skills" icon={PuzzleIcon} />
          <Page.Vertical gap="md" align="stretch">
            <div className="flex flex-col pt-3">
              <SkillsTable skillsConfigurations={skillConfigurations} />
            </div>
          </Page.Vertical>
        </div>
      </AppWideModeLayout>
    </ConversationsNavigationProvider>
  );
}

WorkspaceSkills.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
