import type { InferGetServerSidePropsType } from "next";
import { useSearchParams } from "next/navigation";
import type { ReactElement } from "react";

import { DataSourceViewPage } from "@app/components/poke/pages/DataSourceViewPage";
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

export default function DataSourceViewPageWrapper({
  owner,
  dsId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const searchParams = useSearchParams();
  const documentId = searchParams?.get("documentId") ?? null;

  return (
    <DataSourceViewPage owner={owner} dsId={dsId} documentId={documentId} />
  );
}

DataSourceViewPageWrapper.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return (
    <PokeLayout title={`${owner.name} - View Document`}>{page}</PokeLayout>
  );
};
