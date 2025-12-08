import type { InferGetServerSidePropsType } from "next";
import Head from "next/head";
import React from "react";

import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SkillConfigurationResource } from "@app/lib/resources/skill_configuration_resource";
import type { SubscriptionType, UserType, WorkspaceType } from "@app/types";
import type { SkillConfiguration } from "@app/types/skill_configuration";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  skillConfiguration: SkillConfiguration;
  owner: WorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isUser() || !subscription || !context.params?.sId) {
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

  const skillResource = await SkillConfigurationResource.fetchBySIdWithAuth(
    auth,
    context.params.sId as string
  );

  if (!skillResource) {
    return {
      notFound: true,
    };
  }

  const canEdit = await skillResource.canUserEdit(auth);
  if (!canEdit && !auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  const user = auth.getNonNullableUser().toJSON();
  const skillConfiguration = skillResource.toJSON();

  return {
    props: {
      skillConfiguration,
      owner,
      subscription,
      user,
    },
  };
});

export default function EditSkill({
  skillConfiguration,
  owner,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  if (skillConfiguration.status === "archived") {
    throw new Error("Cannot edit archived skill");
  }

  return (
    <SkillBuilderProvider owner={owner} user={user}>
      <>
        <Head>
          <title>{`Dust - ${skillConfiguration.name}`}</title>
        </Head>
        <SkillBuilder skillConfiguration={skillConfiguration} />
      </>
    </SkillBuilderProvider>
  );
}

EditSkill.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
