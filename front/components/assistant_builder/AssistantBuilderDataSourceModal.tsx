import {
  CloudArrowDownIcon,
  CloudArrowLeftRightIcon,
  Item,
  Modal,
  Page,
  Searchbar,
  SliderToggle,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  ContentNode,
  DataSourceType,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import * as React from "react";
import { useCallback, useEffect, useState } from "react";

import type {
  AssistantBuilderDataSourceConfiguration,
  AssistantBuilderDataSourceConfigurations,
} from "@app/components/assistant_builder/types";
import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { orderDatasourceByImportance } from "@app/lib/assistant";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { subFilter } from "@app/lib/utils";
import type { GetContentNodeParentsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/parents";

export const CONNECTOR_PROVIDER_TO_RESOURCE_NAME: Record<
  ConnectorProvider,
  {
    singular: string;
    plural: string;
  }
> = {
  confluence: { singular: "space", plural: "spaces" },
  notion: { singular: "page", plural: "pages" },
  google_drive: { singular: "folder", plural: "folders" },
  slack: { singular: "channel", plural: "channels" },
  github: { singular: "repository", plural: "repositories" },
  intercom: { singular: "article", plural: "articles" },
  webcrawler: { singular: "page", plural: "pages" },
};

export default function AssistantBuilderDataSourceModal({
  isOpen,
  setOpen,
  owner,
  dataSources,
  onSave,
  onDelete,
  dataSourceConfigurations,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  dataSources: DataSourceType[];
  onSave: (params: AssistantBuilderDataSourceConfiguration) => void;
  onDelete: (name: string) => void;
  dataSourceConfigurations: AssistantBuilderDataSourceConfigurations;
}) {
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);
  const [selectedResources, setSelectedResources] = useState<ContentNode[]>([]);
  const [isSelectAll, setIsSelectAll] = useState(false);

  const onReset = () => {
    setSelectedDataSource(null);
    setSelectedResources([]);
    setIsSelectAll(false);
  };

  const onClose = () => {
    setOpen(false);
    setTimeout(() => {
      onReset();
    }, 200);
  };

  const onSaveLocal = ({ isSelectAll }: { isSelectAll: boolean }) => {
    if (!selectedDataSource) {
      throw new Error("Cannot save an incomplete configuration");
    }
    if (selectedResources.length || isSelectAll) {
      onSave({
        dataSource: selectedDataSource,
        selectedResources,
        isSelectAll,
      });
    } else {
      onDelete(selectedDataSource.name);
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={selectedDataSource !== null ? onReset : onClose}
      onSave={() => onSaveLocal({ isSelectAll })}
      hasChanged={selectedDataSource !== null}
      variant="full-screen"
      title="Manage data sources selection"
    >
      <div className="w-full pt-12">
        {!selectedDataSource || !selectedDataSource.connectorProvider ? (
          <PickDataSource
            dataSources={dataSources}
            show={!selectedDataSource}
            onPick={(ds) => {
              setSelectedDataSource(ds);
              setSelectedResources(
                dataSourceConfigurations[ds.name]?.selectedResources || []
              );
              setIsSelectAll(
                dataSourceConfigurations[ds.name]?.isSelectAll || false
              );
              if (!ds.connectorProvider) {
                onSave({
                  dataSource: ds,
                  selectedResources: [],
                  isSelectAll: true,
                });
                onClose();
              }
            }}
          />
        ) : (
          <DataSourceResourceSelector
            dataSource={selectedDataSource}
            owner={owner}
            selectedResources={selectedResources}
            isSelectAll={isSelectAll}
            onSelectChange={(node, selected) => {
              setSelectedResources((currentResources) => {
                const isNodeAlreadySelected = currentResources.some(
                  (resource) => resource.internalId === node.internalId
                );
                if (selected) {
                  if (!isNodeAlreadySelected) {
                    return [...currentResources, node];
                  }
                } else {
                  if (isNodeAlreadySelected) {
                    return currentResources.filter(
                      (resource) => resource.internalId !== node.internalId
                    );
                  }
                }
                return currentResources;
              });
            }}
            toggleSelectAll={() => {
              const selectAll = !isSelectAll;
              if (isSelectAll === false) {
                setSelectedResources([]);
              }
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
  const [query, setQuery] = useState<string>("");

  const filtered = dataSources.filter((ds) => {
    return subFilter(query.toLowerCase(), ds.name.toLowerCase());
  });

  return (
    <Transition show={show} className="mx-auto max-w-6xl">
      <Page>
        <Page.Header
          title="Select Data Sources in"
          icon={CloudArrowLeftRightIcon}
        />
        <Searchbar
          name="search"
          onChange={setQuery}
          value={query}
          placeholder="Search..."
        />
        {orderDatasourceByImportance(filtered).map((ds) => (
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
  selectedResources: ContentNode[];
  isSelectAll: boolean;
  onSelectChange: (resource: ContentNode, selected: boolean) => void;
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
            internalIds: selectedResources.map((resource) => {
              return resource.internalId;
            }),
          }),
        }
      );
      if (!res.ok) {
        throw new Error("Failed to fetch parents");
      }
      const json: GetContentNodeParentsResponseBody = await res.json();
      setParentsById(
        json.nodes.reduce((acc, r) => {
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
  const hasSelectedResources = selectedResources.length > 0;

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
                Select all
                <SliderToggle
                  selected={isSelectAll}
                  onClick={toggleSelectAll}
                  size="xs"
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
                selectedParentIds={
                  new Set(
                    selectedResources.map((resource) => resource.internalId)
                  )
                }
                parentsById={parentsById}
                onSelectChange={(node, parents, selected) => {
                  const newParentsById = { ...parentsById };
                  if (selected) {
                    newParentsById[node.internalId] = new Set(parents);
                  } else {
                    delete newParentsById[node.internalId];
                  }
                  setParentsById(newParentsById);
                  onSelectChange(node, selected);
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
      case "webcrawler":
        return ds.name;
      default:
        assertNever(ds.connectorProvider);
    }
  } else {
    return ds.name;
  }
}
