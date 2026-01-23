import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { WorkspacePage } from "@app/components/poke/pages/WorkspacePage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { WorkspaceType } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
}>(async (_context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  return {
    props: {
      owner,
    },
  };
});

export default function WorkspacePageNextJS({
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <WorkspacePage owner={owner} />;
}

WorkspacePageNextJS.getLayout = (
  page: ReactElement,
  { owner }: { owner: WorkspaceType }
) => {
  return <PokeLayout title={`${owner.name}`}>{page}</PokeLayout>;
};
