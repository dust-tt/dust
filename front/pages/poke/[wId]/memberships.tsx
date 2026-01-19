import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { MembershipsPage } from "@app/components/poke/pages/MembershipsPage";
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

export default function MembershipsPageWrapper({
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <MembershipsPage owner={owner} />;
}

MembershipsPageWrapper.getLayout = (
  page: ReactElement,
  { owner }: { owner: WorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - Memberships`}>{page}</PokeLayout>;
};
