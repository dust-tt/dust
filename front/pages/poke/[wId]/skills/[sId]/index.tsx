import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { SkillDetailsPage } from "@app/components/poke/pages/SkillDetailsPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { WorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
  sId: string;
}>(async (context, auth) => {
  const { wId, sId } = context.params ?? {};
  if (!isString(wId) || !isString(sId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner: auth.getNonNullableWorkspace(),
      sId,
    },
  };
});

export default function SkillDetailsPageNextJS({
  owner,
  sId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <SkillDetailsPage owner={owner} sId={sId} />;
}

SkillDetailsPageNextJS.getLayout = (
  page: ReactElement,
  { owner }: { owner: WorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - Skill`}>{page}</PokeLayout>;
};
