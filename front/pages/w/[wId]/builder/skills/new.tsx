import { Spinner } from "@dust-tt/sparkle";
import Head from "next/head";
import type { ReactElement } from "react";

import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import {
  appGetServerSidePropsForBuilders,
  type AppPageWithLayout,
} from "@app/lib/auth/appServerSideProps";
import { useSearchParam } from "@app/lib/platform/next";
import { useSkill } from "@app/lib/swr/skill_configurations";

export const getServerSideProps = appGetServerSidePropsForBuilders;

function CreateSkill() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const extendsParam = useSearchParam("extends");

  const { skill: extendedSkillData, isSkillLoading: isExtendedSkillLoading } =
    useSkill({
      workspaceId: owner.sId,
      skillId: extendsParam,
      disabled: !extendsParam,
    });

  if (extendsParam && isExtendedSkillLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  const extendedSkill = extendedSkillData?.isExtendable
    ? extendedSkillData
    : null;

  return (
    <SkillBuilderProvider owner={owner} user={user} skillId={null}>
      <SpacesProvider owner={owner}>
        <Head>
          <title>Dust - New Skill</title>
        </Head>
        <SkillBuilder extendedSkill={extendedSkill ?? undefined} />
      </SpacesProvider>
    </SkillBuilderProvider>
  );
}

const CreateSkillWithLayout = CreateSkill as AppPageWithLayout;

CreateSkillWithLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default CreateSkillWithLayout;
