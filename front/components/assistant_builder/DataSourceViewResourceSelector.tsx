import { Page, SliderToggle } from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
} from "@dust-tt/types";
import { Transition } from "@headlessui/react";

import { getConnectorProviderResourceName } from "@app/components/assistant_builder/shared";
import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { useParentResourcesById } from "@app/hooks/useParentResourcesById";
import {
  CONNECTOR_CONFIGURATIONS,
  getConnectorProviderLogo,
} from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";

export default function DataSourceViewResourceSelector({
  dataSourceView,
  owner,
  selectedResources,
  isSelectAll,
  onSelectChange,
  toggleSelectAll,
}: {
  dataSourceView: DataSourceViewType;
  owner: LightWorkspaceType;
  selectedResources: LightContentNode[];
  isSelectAll: boolean;
  onSelectChange: (
    dsView: DataSourceViewType,
    resource: LightContentNode,
    selected: boolean
  ) => void;
  toggleSelectAll: (dsView: DataSourceViewType) => void;
}) {
  const { parentsById, setParentsById } = useParentResourcesById({
    owner,
    dataSource: dataSourceView.dataSource,
    internalIds: selectedResources.map((r) => r.internalId),
  });

  const selectedParents = [
    ...new Set(Object.values(parentsById).flatMap((c) => [...c])),
  ];

  return (
    <Transition show className="mx-auto max-w-6xl pb-8">
      <Page>
        <Page.Header
          title={`Select Data Sources in ${getDisplayNameForDataSource(
            dataSourceView.dataSource
          )}`}
          icon={
            getConnectorProviderLogo(
              dataSourceView.dataSource.connectorProvider
            ) ?? undefined
          }
          description="Select the files and folders that will be used by the assistant as a source for its answers."
        />
        {dataSourceView && (
          <div className="flex flex-row gap-32">
            <div className="flex-1">
              <div className="flex gap-4 pb-8 text-lg font-semibold text-element-900">
                Select all
                <SliderToggle
                  selected={isSelectAll}
                  onClick={() => {
                    toggleSelectAll(dataSourceView);
                    setParentsById({});
                  }}
                  size="xs"
                />
              </div>
              <div className="flex flex-row pb-4 text-lg font-semibold text-element-900">
                <div>
                  Select from available{" "}
                  {getConnectorProviderResourceName(
                    dataSourceView.dataSource
                      .connectorProvider as ConnectorProvider,
                    true
                  )}
                </div>
              </div>
              <DataSourceResourceSelectorTree
                owner={owner}
                dataSourceView={dataSourceView}
                showExpand={
                  CONNECTOR_CONFIGURATIONS[
                    dataSourceView.dataSource
                      .connectorProvider as ConnectorProvider
                  ]?.isNested
                }
                selectedResourceIds={selectedResources.map((r) => r.internalId)}
                selectedParents={selectedParents}
                onSelectChange={(node, parents, selected) => {
                  setParentsById((parentsById) => {
                    const newParentsById = { ...parentsById };
                    if (selected) {
                      newParentsById[node.internalId] = new Set(parents);
                    } else {
                      delete newParentsById[node.internalId];
                    }
                    return newParentsById;
                  });
                  onSelectChange(dataSourceView, node, selected);
                }}
                parentIsSelected={isSelectAll}
              />
            </div>
          </div>
        )}
      </Page>
    </Transition>
  );
}
