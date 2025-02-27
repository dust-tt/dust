import type { PokeDataSourceViewType, WorkspaceType } from "@dust-tt/types";
import { defaultSelectionConfiguration } from "@dust-tt/types";
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
    <div className="flex flex-row gap-x-6">
      <ViewDataSourceViewTable dataSourceView={dataSourceView} owner={owner} />
      <div className="mt-4 flex grow flex-col">
        <PluginList
          resourceType="data_source_views"
          workspaceResource={{
            workspace: owner,
            resourceId: dataSourceView.sId,
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
  );
}

DataSourceViewPage.getLayout = (page: ReactElement) => {
  return <PokeLayout>{page}</PokeLayout>;
};
