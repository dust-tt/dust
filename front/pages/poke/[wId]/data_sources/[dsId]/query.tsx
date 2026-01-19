import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { DataSourceQueryPage } from "@app/components/poke/pages/DataSourceQueryPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { LightWorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  dsId: string;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { wId, dsId } = context.params ?? {};
  if (!isString(wId) || !isString(dsId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      dsId,
    },
  };
});

export default function DataSourceQueryPageWrapper({
  owner,
  dsId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <DataSourceQueryPage owner={owner} dsId={dsId} />;
}

DataSourceQueryPageWrapper.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - Query`}>{page}</PokeLayout>;
};
