import type { InferGetServerSidePropsType } from "next";
import Head from "next/head";
import React from "react";

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
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isUser() || !subscription) {
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
      <>
        <Head>
          <title>Dust - New Skill</title>
        </Head>
        <SkillBuilder />
      </>
    </SkillBuilderProvider>
  );
}

CreateSkill.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
