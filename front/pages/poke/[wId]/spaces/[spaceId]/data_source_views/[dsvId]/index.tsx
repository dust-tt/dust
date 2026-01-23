import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { SpaceDataSourceViewPage } from "@app/components/poke/pages/SpaceDataSourceViewPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { LightWorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  dsvId: string;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { wId, spaceId, dsvId } = context.params ?? {};
  if (!isString(wId) || !isString(spaceId) || !isString(dsvId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      dsvId,
    },
  };
});

export default function SpaceDataSourceViewPageNextJS({
  owner,
  dsvId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <SpaceDataSourceViewPage owner={owner} dsvId={dsvId} />;
}

SpaceDataSourceViewPageNextJS.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return (
    <PokeLayout title={`${owner.name} - Data Source View`}>{page}</PokeLayout>
  );
};
