import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { DataSourcePage } from "@app/components/poke/pages/DataSourcePage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { WorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
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

export default function DataSourcePageWrapper({
  owner,
  dsId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <DataSourcePage owner={owner} dsId={dsId} />;
}

DataSourcePageWrapper.getLayout = (
  page: ReactElement,
  { owner }: { owner: WorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - Data Source`}>{page}</PokeLayout>;
};
