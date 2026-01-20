import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { DataSourceSearchPage } from "@app/components/poke/pages/DataSourceSearchPage";
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

export default function DataSourceSearchPageNextJS({
  owner,
  dsId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <DataSourceSearchPage owner={owner} dsId={dsId} />;
}

DataSourceSearchPageNextJS.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - Search`}>{page}</PokeLayout>;
};
