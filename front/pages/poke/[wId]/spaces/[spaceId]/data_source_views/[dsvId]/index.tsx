import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { DataSourceViewSelector } from "@app/components/data_source_view/DataSourceViewSelector";
import { ViewDataSourceViewTable } from "@app/components/poke/data_source_views/view";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { dataSourceViewToPokeJSON } from "@app/lib/poke/utils";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { DataSourceViewContentNodesProps } from "@app/poke/swr/data_source_views";
import { usePokeDataSourceViewContentNodes } from "@app/poke/swr/data_source_views";
import type { PokeDataSourceViewType, WorkspaceType } from "@app/types";
import { defaultSelectionConfiguration } from "@app/types";

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
      dataSourceView: await dataSourceViewToPokeJSON(dataSourceView),
    },
  };
});

export default function DataSourceViewPage({
  dataSourceView,
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const useContentNodes = (params: DataSourceViewContentNodesProps) => {
    return usePokeDataSourceViewContentNodes({
      ...params,
    });
  };

  return (
    <>
      <h3 className="text-xl font-bold">
        {dataSourceView.name} in space{" "}
        <a
          href={`/poke/${owner.sId}/spaces/${dataSourceView.space.sId}`}
          className="text-highlight-500"
        >
          {dataSourceView.space.name}
        </a>{" "}
        within workspace{" "}
        <a href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </a>
      </h3>
      <p>
        The data displayed here is fetched from <b>core</b> (
        <i>elasticsearch index</i>).
      </p>
      <div className="flex flex-row gap-x-6">
        <ViewDataSourceViewTable
          dataSourceView={dataSourceView}
          owner={owner}
        />
        <div className="mt-4 flex grow flex-col">
          <PluginList
            pluginResourceTarget={{
              resourceId: dataSourceView.sId,
              resourceType: "data_source_views",
              workspace: owner,
            }}
          />
          <div className="border-material-200 my-4 rounded-lg border p-4">
            <DataSourceViewSelector
              owner={owner}
              readonly
              selectionConfiguration={defaultSelectionConfiguration(
                dataSourceView
              )}
              setSelectionConfigurations={() => {}}
              useContentNodes={useContentNodes}
              viewType="all"
              isRootSelectable={true}
            />
          </div>
        </div>
      </div>
    </>
  );
}

DataSourceViewPage.getLayout = (
  page: ReactElement,
  {
    owner,
    dataSourceView,
  }: { owner: WorkspaceType; dataSourceView: PokeDataSourceViewType }
) => {
  return (
    <PokeLayout
      title={`${owner.name} - ${dataSourceView.name} in ${dataSourceView.space.name}`}
    >
      {page}
    </PokeLayout>
  );
};
