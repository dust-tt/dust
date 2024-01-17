import {
  CloudArrowDownIcon,
  CloudArrowLeftRightIcon,
  Item,
  Modal,
  Page,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { ConnectorProvider, DataSourceType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import * as React from "react";
import { useCallback, useEffect, useState } from "react";

import type { AssistantBuilderDataSourceConfiguration } from "@app/components/assistant_builder/AssistantBuilder";
import { CONNECTOR_PROVIDER_TO_RESOURCE_NAME } from "@app/components/assistant_builder/AssistantBuilder";
import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { GetConnectorResourceParentsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/parents";

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
  onSave: (params: AssistantBuilderDataSourceConfiguration) => void;
  dataSourceToManage: AssistantBuilderDataSourceConfiguration | null;
}) {
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);
  const [selectedResources, setSelectedResources] = useState<
    Record<string, string>
  >({});
  const [isSelectAll, setIsSelectAll] = useState(false);

  useEffect(() => {
    if (dataSourceToManage) {
      setSelectedDataSource(dataSourceToManage.dataSource);
      setSelectedResources(dataSourceToManage.selectedResources);
      setIsSelectAll(dataSourceToManage.isSelectAll);
    }
  }, [dataSourceToManage]);

  const onClose = () => {
    setOpen(false);
    setTimeout(() => {
      setSelectedDataSource(null);
      setSelectedResources({});
      setIsSelectAll(false);
    }, 200);
  };

  const onSaveLocal = ({ isSelectAll }: { isSelectAll: boolean }) => {
    if (
      !selectedDataSource ||
      (Object.keys(selectedResources).length === 0 && !isSelectAll)
    ) {
      throw new Error("Cannot save an incomplete configuration");
    }
    onSave({
      dataSource: selectedDataSource,
      selectedResources,
      isSelectAll,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onSave={() => onSaveLocal({ isSelectAll })}
      hasChanged={
        !!selectedDataSource &&
        (Object.keys(selectedResources).length > 0 || isSelectAll)
      }
      variant="full-screen"
      title="Add data sources"
    >
      <div className="w-full pt-12">
        {!selectedDataSource || !selectedDataSource.connectorProvider ? (
          <PickDataSource
            dataSources={dataSources}
            show={!dataSourceToManage}
            onPick={(ds) => {
              setSelectedDataSource(ds);
              if (!ds.connectorProvider) {
                onSave({
                  dataSource: ds,
                  selectedResources: {},
                  isSelectAll: true,
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
            isSelectAll={isSelectAll}
            onSelectChange={({ resourceId, resourceName }, selected) => {
              const newSelectedResources = { ...selectedResources };
              if (selected) {
                newSelectedResources[resourceId] = resourceName;
              } else {
                delete newSelectedResources[resourceId];
              }

              setSelectedResources(newSelectedResources);
            }}
            toggleSelectAll={() => {
              const selectAll = !isSelectAll;
              setIsSelectAll(selectAll);
            }}
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
      <Page>
        <Page.Header
          title="Select Data Sources in:"
          icon={CloudArrowLeftRightIcon}
        />
        {dataSources
          .sort(
            (a, b) =>
              (b.connectorProvider ? 1 : 0) - (a.connectorProvider ? 1 : 0)
          )
          .map((ds) => (
            <Item.Navigation
              label={getDisplayNameForDataSource(ds)}
              icon={
                ds.connectorProvider
                  ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider].logoComponent
                  : CloudArrowDownIcon
              }
              key={ds.name}
              onClick={() => {
                onPick(ds);
              }}
            />
          ))}
      </Page>
    </Transition>
  );
}

function DataSourceResourceSelector({
  dataSource,
  owner,
  selectedResources,
  isSelectAll,
  onSelectChange,
  toggleSelectAll,
}: {
  dataSource: DataSourceType | null;
  owner: WorkspaceType;
  selectedResources: Record<string, string>;
  isSelectAll: boolean;
  onSelectChange: (
    resource: { resourceId: string; resourceName: string },
    selected: boolean
  ) => void;
  toggleSelectAll: () => void;
}) {
  const [parentsById, setParentsById] = useState<Record<string, Set<string>>>(
    {}
  );
  const [parentsAreLoading, setParentsAreLoading] = useState(false);
  const [parentsAreError, setParentsAreError] = useState(false);

  const fetchParents = useCallback(async () => {
    setParentsAreLoading(true);
    try {
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${encodeURIComponent(
          dataSource?.name || ""
        )}/managed/parents`,
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
  }, [owner, dataSource?.name, selectedResources]);

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

  return (
    <Transition show={!!dataSource} className="mx-auto max-w-6xl pb-8">
      <Page>
        <Page.Header
          title={`Select Data Sources in ${
            dataSource ? getDisplayNameForDataSource(dataSource) : null
          }`}
          icon={
            CONNECTOR_CONFIGURATIONS[
              dataSource?.connectorProvider as ConnectorProvider
            ]?.logoComponent
          }
          description="Select the files and folders that will be used by the assistant as a source for its answers."
        />
        {dataSource && (
          <div className="flex flex-row gap-32">
            <div className="flex-1">
              <div className="flex gap-4 pb-8 text-lg font-semibold text-element-900">
                Select all:{" "}
                <SliderToggle
                  selected={isSelectAll}
                  onClick={toggleSelectAll}
                  size="md"
                />
              </div>
              <div className="flex flex-row pb-4 text-lg font-semibold text-element-900">
                <div>
                  Select from available{" "}
                  {CONNECTOR_PROVIDER_TO_RESOURCE_NAME[
                    dataSource.connectorProvider as ConnectorProvider
                  ]?.plural ?? "resources"}
                  :
                </div>
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
                onSelectChange={(
                  { resourceId, resourceName, parents },
                  selected
                ) => {
                  const newParentsById = { ...parentsById };
                  if (selected) {
                    newParentsById[resourceId] = new Set(parents);
                  } else {
                    delete newParentsById[resourceId];
                  }

                  setParentsById(newParentsById);
                  onSelectChange({ resourceId, resourceName }, selected);
                }}
                fullySelected={isSelectAll}
              />
            </div>
          </div>
        )}
      </Page>
    </Transition>
  );
}
function getDisplayNameForDataSource(ds: DataSourceType) {
  if (ds.connectorProvider) {
    switch (ds.connectorProvider) {
      case "confluence":
      case "slack":
      case "google_drive":
      case "github":
      case "intercom":
      case "notion":
        return CONNECTOR_CONFIGURATIONS[ds.connectorProvider].name;
        break;
      case "webcrawler":
        return ds.name;
      default:
        assertNever(ds.connectorProvider);
    }
  } else {
    return ds.name;
  }
}
