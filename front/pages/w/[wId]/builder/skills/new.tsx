import type { InferGetServerSidePropsType } from "next";
import Head from "next/head";
import React from "react";

import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SubscriptionType, UserType, WorkspaceType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
  extendedSkill: SkillType | null;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const { query } = context;
  const skillToExtend =
    typeof query.extends === "string"
      ? await SkillResource.fetchById(auth, query.extends)
      : null;
  const extendedSkill = skillToExtend?.isExtendable
    ? skillToExtend.toJSON(auth)
    : null;

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
      extendedSkill,
    },
  };
});

export default function CreateSkill({
  owner,
  user,
  extendedSkill,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <SkillBuilderProvider owner={owner} user={user} skillConfigurationId={null}>
      <SpacesProvider owner={owner}>
        <Head>
          <title>Dust - New Skill</title>
        </Head>
        <SkillBuilder extendedSkill={extendedSkill ?? undefined} />
      </SpacesProvider>
    </SkillBuilderProvider>
  );
}

CreateSkill.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
