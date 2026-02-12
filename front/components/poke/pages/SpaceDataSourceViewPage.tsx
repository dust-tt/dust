import { LinkWrapper, Spinner } from "@dust-tt/sparkle";

import { DataSourceViewSelector } from "@app/components/data_source_view/DataSourceViewSelector";
import { ViewDataSourceViewTable } from "@app/components/poke/data_source_views/view";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeDataSourceViewDetails } from "@app/poke/swr/data_source_view_details";
import type { DataSourceViewContentNodesProps } from "@app/poke/swr/data_source_views";
import { usePokeDataSourceViewContentNodes } from "@app/poke/swr/data_source_views";
import { defaultSelectionConfiguration } from "@app/types/data_source_view";

export function SpaceDataSourceViewPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - Data Source View`);

  const dsvId = useRequiredPathParam("dsvId");
  const {
    data: dataSourceViewDetails,
    isLoading,
    isError,
  } = usePokeDataSourceViewDetails({
    owner,
    dataSourceViewId: dsvId,
    disabled: false,
  });

  const useContentNodes = (
    contentNodesParams: DataSourceViewContentNodesProps
  ) => {
    return usePokeDataSourceViewContentNodes({
      ...contentNodesParams,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !dataSourceViewDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading data source view details.</p>
      </div>
    );
  }

  const { dataSourceView } = dataSourceViewDetails;

  return (
    <>
      <h3 className="text-xl font-bold">
        {dataSourceView.name} in space{" "}
        <LinkWrapper
          href={`/poke/${owner.sId}/spaces/${dataSourceView.space.sId}`}
          className="text-highlight-500"
        >
          {dataSourceView.space.name}
        </LinkWrapper>{" "}
        within workspace{" "}
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
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
