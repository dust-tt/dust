import { CloudArrowDownIcon, Item, Modal, PageHeader } from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";

import { CONNECTOR_PROVIDER_TO_RESOURCE_NAME } from "@app/components/assistant_builder/AssistantBuilder";
import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { ConnectorProvider } from "@app/lib/connectors_api";
import { GetConnectorResourceParentsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/parents";
import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

export default function AssistantBuilderDataSourceModal({
  isOpen,
  setOpen,
  owner,
  dataSources,
  onSave,
  dataSourceToManage,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  dataSources: DataSourceType[];
  onSave: (params: {
    dataSource: DataSourceType;
    selectedResources: Record<string, string>;
  }) => void;
  dataSourceToManage: {
    dataSource: DataSourceType;
    selectedResources: Record<string, string>;
  } | null;
}) {
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);
  const [selectedResources, setSelectedResources] = useState<
    Record<string, string>
  >({});

  const [parentsById, setParentsById] = useState<Record<string, Set<string>>>(
    {}
  );
  const [parentsAreLoading, setParentsAreLoading] = useState(false);
  const [parentsAreError, setParentsAreError] = useState(false);

  const fetchParents = useCallback(async () => {
    setParentsAreLoading(true);
    try {
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${selectedDataSource?.name}/managed/parents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            resourceInternalIds: Object.keys(selectedResources),
          }),
        }
      );
      if (!res.ok) {
        throw new Error("Failed to fetch parents");
      }
      const json: GetConnectorResourceParentsResponseBody = await res.json();
      setParentsById(
        json.resources.reduce((acc, r) => {
          acc[r.internalId] = new Set(r.parents);
          return acc;
        }, {} as Record<string, Set<string>>)
      );
    } catch (e) {
      setParentsAreError(true);
    } finally {
      setParentsAreLoading(false);
    }
  }, [owner, selectedDataSource, selectedResources]);

  useEffect(() => {
    if (dataSourceToManage) {
      setSelectedDataSource(dataSourceToManage.dataSource);
      setSelectedResources(dataSourceToManage.selectedResources);
    }
  }, [dataSourceToManage]);

  const hasParentsById = Object.keys(parentsById || {}).length > 0;
  const hasSelectedResources = Object.keys(selectedResources).length > 0;

  useEffect(() => {
    if (parentsAreLoading || parentsAreError) {
      return;
    }
    if (!hasParentsById && hasSelectedResources) {
      fetchParents().catch(console.error);
    }
  }, [
    hasParentsById,
    hasSelectedResources,
    fetchParents,
    parentsAreLoading,
    parentsAreError,
  ]);

  const onClose = () => {
    setOpen(false);
    setTimeout(() => {
      setSelectedDataSource(null);
      setSelectedResources({});
    }, 200);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onSave={() => {
        if (
          !selectedDataSource ||
          Object.keys(selectedResources).length === 0
        ) {
          throw new Error("Cannot save an incomplete configuration");
        }
        onSave({
          dataSource: selectedDataSource,
          selectedResources,
        });
        onClose();
      }}
      hasChanged={
        !!selectedDataSource && Object.keys(selectedResources).length > 0
      }
      isFullScreen={true}
      title="Add a data source"
    >
      <div className="w-full pt-12">
        {!selectedDataSource ? (
          <PickDataSource
            dataSources={dataSources}
            show={!dataSourceToManage}
            onPick={(ds) => {
              setSelectedDataSource(ds);
              if (!ds.connectorProvider) {
                onSave({
                  dataSource: ds,
                  selectedResources: {},
                });
                onClose();
              }
            }}
          />
        ) : (
          <DataSourceResourceSelector
            dataSource={dataSourceToManage?.dataSource ?? selectedDataSource}
            owner={owner}
            selectedResources={selectedResources}
            onSelectChange={(
              { resourceId, resourceName, parents },
              selected
            ) => {
              const newSelectedResources = { ...selectedResources };
              const newParentsById = { ...parentsById };
              if (selected) {
                newSelectedResources[resourceId] = resourceName;
                newParentsById[resourceId] = new Set(parents);
              } else {
                delete newSelectedResources[resourceId];
                delete newParentsById[resourceId];
              }

              setSelectedResources(newSelectedResources);
              setParentsById(newParentsById);
            }}
            parentsById={parentsById}
          />
        )}
      </div>
    </Modal>
  );
}

function PickDataSource({
  dataSources,
  show,
  onPick,
}: {
  dataSources: DataSourceType[];
  show: boolean;
  onPick: (dataSource: DataSourceType) => void;
}) {
  return (
    <Transition show={show} className="mx-auto max-w-6xl">
      <div className="flex flex-col">
        <div className="mb-6">
          <PageHeader
            title="Select a new data source"
            icon={CloudArrowDownIcon}
            description="What kind of data source do you want to add?"
          />
        </div>

        {dataSources
          .sort(
            (a, b) =>
              (b.connectorProvider ? 1 : 0) - (a.connectorProvider ? 1 : 0)
          )
          .map((ds) => (
            <Item
              label={
                ds.connectorProvider
                  ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider].name
                  : ds.name
              }
              icon={
                ds.connectorProvider
                  ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider].logoComponent
                  : CloudArrowDownIcon
              }
              key={ds.name}
              size="md"
              onClick={() => {
                onPick(ds);
              }}
            />
          ))}
      </div>
    </Transition>
  );
}

function DataSourceResourceSelector({
  dataSource,
  owner,
  selectedResources,
  onSelectChange,
  parentsById,
}: {
  dataSource: DataSourceType | null;
  owner: WorkspaceType;
  selectedResources: Record<string, string>;
  onSelectChange: (
    resource: { resourceId: string; resourceName: string; parents: string[] },
    selected: boolean
  ) => void;
  parentsById: Record<string, Set<string>>;
}) {
  return (
    <Transition show={!!dataSource} className="mx-auto max-w-6xl pb-8">
      <div className="mb-6">
        <div>
          <PageHeader
            title={`Select Data sources in ${
              CONNECTOR_CONFIGURATIONS[
                dataSource?.connectorProvider as ConnectorProvider
              ]?.name
            }`}
            icon={
              CONNECTOR_CONFIGURATIONS[
                dataSource?.connectorProvider as ConnectorProvider
              ]?.logoComponent
            }
            description="Select the files and folders that will be used by the assistant as a source for its answers."
          />
        </div>
      </div>
      {dataSource && (
        <div className="flex flex-row gap-32">
          <div className="flex-1">
            <div className="pb-4 text-lg font-semibold text-element-900">
              All available{" "}
              {CONNECTOR_PROVIDER_TO_RESOURCE_NAME[
                dataSource.connectorProvider as ConnectorProvider
              ]?.plural ?? "resources"}
              :
            </div>
            <DataSourceResourceSelectorTree
              owner={owner}
              dataSource={dataSource}
              expandable={
                CONNECTOR_CONFIGURATIONS[
                  dataSource.connectorProvider as ConnectorProvider
                ]?.isNested
              }
              selectedParentIds={new Set(Object.keys(selectedResources))}
              parentsById={parentsById}
              onSelectChange={onSelectChange}
            />
          </div>
        </div>
      )}
    </Transition>
  );
}
