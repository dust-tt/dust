import type { PokeDataSourceViewType, WorkspaceType } from "@dust-tt/types";
import { defaultSelectionConfiguration } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { DataSourceViewSelector } from "@app/components/data_source_view/DataSourceViewSelector";
import { ViewDataSourceViewTable } from "@app/components/poke/data_source_views/view";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import PokeLayout from "@app/pages/poke/PokeLayout";
import { usePokeDataSourceViewContentNodes } from "@app/poke/swr/data_source_views";

export const getServerSideProps = withSuperUserAuthRequirements<{
  dataSourceView: PokeDataSourceViewType;
  owner: WorkspaceType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { dsvId } = context.params || {};
  if (typeof dsvId !== "string") {
    return {
      notFound: true,
    };
  }

  const dataSourceView = await DataSourceViewResource.fetchById(auth, dsvId, {
    includeEditedBy: true,
  });
  if (!dataSourceView) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      dataSourceView: await dataSourceView.toPokeJSON(),
    },
  };
});

export default function DataSourceViewPage({
  dataSourceView,
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="flex flex-row gap-6">
      <ViewDataSourceViewTable dataSourceView={dataSourceView} owner={owner} />
      <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
        <DataSourceViewSelector
          owner={owner}
          readonly
          selectionConfiguration={defaultSelectionConfiguration(dataSourceView)}
          setSelectionConfigurations={() => {}}
          useContentNodes={usePokeDataSourceViewContentNodes}
          viewType="documents"
          isRootSelectable={true}
        />
      </div>
    </div>
  );
}

DataSourceViewPage.getLayout = (page: ReactElement) => {
  return <PokeLayout>{page}</PokeLayout>;
};
