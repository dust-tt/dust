import { Spinner } from "@dust-tt/sparkle";
import Head from "next/head";
import type { ReactElement } from "react";

import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform/next";
import { useSkill } from "@app/lib/swr/skill_configurations";

export const getServerSideProps = appGetServerSideProps;

function EditSkill() {
  const router = useAppRouter();
  const owner = useWorkspace();
  const { user } = useAuth();
  const skillId = useRequiredPathParam("sId");

  const { skill, isSkillLoading, isSkillError } = useSkill({
    workspaceId: owner.sId,
    skillId,
    withRelations: true,
  });

  const isNotFound =
    isSkillError ||
    (!isSkillLoading && !skill) ||
    (skill && (!skill.canWrite || skill.status === "archived"));

  if (isNotFound) {
    void router.replace("/404");
  }

  if (isNotFound || isSkillLoading || !skill) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <SkillBuilderProvider owner={owner} user={user} skillId={skill.sId}>
      <Head>
        <title>{`Dust - ${skill.name}`}</title>
      </Head>
      <SkillBuilder
        skill={skill}
        extendedSkill={skill.relations?.extendedSkill ?? undefined}
      />
    </SkillBuilderProvider>
  );
}

const EditSkillWithLayout = EditSkill as AppPageWithLayout;

EditSkillWithLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default EditSkillWithLayout;
