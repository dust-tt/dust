import type { InferGetServerSidePropsType } from "next";
import Head from "next/head";
import React from "react";

import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type { SubscriptionType, UserType, WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
}>(async (_, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
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

  const user = auth.getNonNullableUser().toJSON();

  return {
    props: {
      owner,
      subscription,
      user,
    },
  };
});

export default function CreateSkill({
  owner,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <SkillBuilderProvider owner={owner} user={user}>
      <SpacesProvider owner={owner}>
        <Head>
          <title>Dust - New Skill</title>
        </Head>
        <SkillBuilder />
      </SpacesProvider>
    </SkillBuilderProvider>
  );
}

CreateSkill.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
