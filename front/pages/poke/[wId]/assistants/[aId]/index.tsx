import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { AssistantDetailsPage } from "@app/components/poke/pages/AssistantDetailsPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { WorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
  aId: string;
}>(async (context, auth) => {
  const { wId, aId } = context.params ?? {};
  if (!isString(wId) || !isString(aId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner: auth.getNonNullableWorkspace(),
      aId,
    },
  };
});

export default function AssistantDetailsPageWrapper({
  owner,
  aId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <AssistantDetailsPage owner={owner} aId={aId} />;
}

AssistantDetailsPageWrapper.getLayout = (
  page: ReactElement,
  { owner }: { owner: WorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - Assistants`}>{page}</PokeLayout>;
};
