import {
  CloudArrowDownIcon,
  CloudArrowLeftRightIcon,
  FolderIcon,
  GlobeAltIcon,
  Item,
  Modal,
  Page,
  Searchbar,
  SliderToggle,
  Tree,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  ContentNode,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { useEffect, useState } from "react";

import type {
  AssistantBuilderDataSourceConfiguration,
  AssistantBuilderDataSourceConfigurations,
} from "@app/components/assistant_builder/types";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { useParentResourcesById } from "@app/hooks/useParentResourcesById";
import { orderDatasourceByImportance } from "@app/lib/assistant";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { subFilter } from "@app/lib/utils";

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
  microsoft: { singular: "folder", plural: "folders" },
  webcrawler: { singular: "page", plural: "pages" },
};

function getUpdatedConfigurations(
  currentConfigurations: AssistantBuilderDataSourceConfigurations,
  dataSource: DataSourceType,
  selected: boolean,
  node: ContentNode
) {
  const oldConfiguration = currentConfigurations[dataSource.name] || {
    dataSource: dataSource,
    selectedResources: [],
    isSelectAll: false,
  };

  const newConfiguration = {
    ...oldConfiguration,
  } satisfies AssistantBuilderDataSourceConfiguration;

  if (selected) {
    newConfiguration.selectedResources = [
      ...oldConfiguration.selectedResources,
      node,
    ];
  } else {
    newConfiguration.selectedResources =
      oldConfiguration.selectedResources.filter(
        (resource) => resource.internalId !== node.internalId
      );
  }

  const newConfigurations = { ...currentConfigurations };

  if (
    newConfiguration.isSelectAll ||
    newConfiguration.selectedResources.length > 0
  ) {
    newConfigurations[dataSource.name] = newConfiguration;
  } else {
    delete newConfigurations[dataSource.name];
  }

  return newConfigurations;
}

export default function AssistantBuilderDataSourceModal({
  isOpen,
  setOpen,
  owner,
  dataSources,
  onSave,
  initialDataSourceConfigurations,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  dataSources: DataSourceType[];
  onSave: (dsConfigs: AssistantBuilderDataSourceConfigurations) => void;
  initialDataSourceConfigurations: AssistantBuilderDataSourceConfigurations;
}) {
  // Local modal state, that replaces the action's datasourceConfigurations state in the global
  // assistant builder state when the modal is saved.
  const [dataSourceConfigurations, setDataSourceConfigurations] =
    useState<AssistantBuilderDataSourceConfigurations | null>(null);

  // Navigation state
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);
  // Hack to filter out Folders from the list of data sources
  const [shouldDisplayFoldersScreen, setShouldDisplayFoldersScreen] =
    useState(false);
  // Hack to filter out Websites from the list of data sources
  const [shouldDisplayWebsitesScreen, setShouldDisplayWebsitesScreen] =
    useState(false);

  useNavigationLock(true, {
    title: "Warning",
    message:
      "All unsaved changes will be lost, are you sure you want to continue?",
    validation: "primaryWarning",
  });

  useEffect(() => {
    if (!dataSourceConfigurations && isOpen) {
      setDataSourceConfigurations(initialDataSourceConfigurations);
    } else if (!isOpen) {
      setDataSourceConfigurations(null);
      setSelectedDataSource(null);
      setShouldDisplayFoldersScreen(false);
      setShouldDisplayWebsitesScreen(false);
    }
  }, [dataSourceConfigurations, initialDataSourceConfigurations, isOpen]);

  if (!dataSourceConfigurations) {
    return null;
  }

  const allFolders = dataSources.filter((ds) => !ds.connectorProvider);
  const alreadySelectedFolders = Object.values(dataSourceConfigurations).filter(
    (ds) => !ds.dataSource.connectorProvider
  );

  const allWebsites = dataSources.filter(
    (ds) => ds.connectorProvider === "webcrawler"
  );

  const alreadySelectedWebsites = Object.values(
    dataSourceConfigurations
  ).filter((ds) => ds.dataSource.connectorProvider === "webcrawler");

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (shouldDisplayFoldersScreen) {
          setShouldDisplayFoldersScreen(false);
        } else if (shouldDisplayWebsitesScreen) {
          setShouldDisplayWebsitesScreen(false);
        } else if (selectedDataSource !== null) {
          setSelectedDataSource(null);
        } else {
          setOpen(false);
        }
      }}
      onSave={() => {
        onSave(dataSourceConfigurations);
        setOpen(false);
      }}
      hasChanged={
        selectedDataSource !== null ||
        shouldDisplayFoldersScreen ||
        shouldDisplayWebsitesScreen
      }
      variant="full-screen"
      title="Manage data sources selection"
    >
      <div className="w-full pt-12">
        {!selectedDataSource &&
          !shouldDisplayFoldersScreen &&
          !shouldDisplayWebsitesScreen && (
            <PickDataSource
              dataSources={dataSources}
              show={!selectedDataSource}
              onPick={(ds) => {
                setSelectedDataSource(ds);
              }}
              onPickFolders={() => {
                setShouldDisplayFoldersScreen(true);
              }}
              onPickWebsites={() => {
                setShouldDisplayWebsitesScreen(true);
              }}
            />
          )}
        {!selectedDataSource &&
          (shouldDisplayFoldersScreen || shouldDisplayWebsitesScreen) && (
            <FolderOrWebsiteResourceSelector
              owner={owner}
              type={shouldDisplayFoldersScreen ? "folder" : "website"}
              dataSources={
                shouldDisplayFoldersScreen ? allFolders : allWebsites
              }
              selectedNodes={
                shouldDisplayFoldersScreen
                  ? alreadySelectedFolders
                  : alreadySelectedWebsites
              }
              onSelectChange={(ds, selected, contentNode) => {
                setDataSourceConfigurations((currentConfigurations) => {
                  if (currentConfigurations === null) {
                    // Unreachable
                    return null;
                  }

                  if (contentNode === undefined) {
                    if (selected) {
                      return {
                        ...currentConfigurations,
                        [ds.name]: {
                          dataSource: ds,
                          selectedResources: [],
                          isSelectAll: true,
                        },
                      };
                    } else {
                      const newConfigurations = { ...currentConfigurations };
                      delete newConfigurations[ds.name];
                      return newConfigurations;
                    }
                  }

                  return getUpdatedConfigurations(
                    currentConfigurations,
                    ds,
                    selected,
                    contentNode
                  );
                });
              }}
            />
          )}
        {selectedDataSource && (
          <DataSourceResourceSelector
            dataSource={selectedDataSource}
            owner={owner}
            selectedResources={
              dataSourceConfigurations[selectedDataSource.name]
                ?.selectedResources || []
            }
            isSelectAll={
              dataSourceConfigurations[selectedDataSource.name]?.isSelectAll ||
              false
            }
            onSelectChange={(node, selected) => {
              setDataSourceConfigurations((currentConfigurations) => {
                if (currentConfigurations === null) {
                  // Unreachable
                  return null;
                }

                return getUpdatedConfigurations(
                  currentConfigurations,
                  selectedDataSource,
                  selected,
                  node
                );
              });
            }}
            toggleSelectAll={() => {
              setDataSourceConfigurations((currentConfigurations) => {
                if (currentConfigurations === null) {
                  // Unreachable
                  return null;
                }
                const oldConfiguration = currentConfigurations[
                  selectedDataSource.name
                ] || {
                  dataSource: selectedDataSource,
                  selectedResources: [],
                  isSelectAll: false,
                };

                const newConfiguration = {
                  ...oldConfiguration,
                  isSelectAll: !oldConfiguration.isSelectAll,
                  selectedResources: [],
                } satisfies AssistantBuilderDataSourceConfiguration;

                const newConfigurations = { ...currentConfigurations };

                if (
                  newConfiguration.isSelectAll ||
                  newConfiguration.selectedResources.length > 0
                ) {
                  newConfigurations[selectedDataSource.name] = newConfiguration;
                } else {
                  delete newConfigurations[selectedDataSource.name];
                }

                return {
                  ...currentConfigurations,
                  [selectedDataSource.name]: newConfiguration,
                };
              });
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
  onPickFolders,
  onPickWebsites,
}: {
  dataSources: DataSourceType[];
  show: boolean;
  onPick: (dataSource: DataSourceType) => void;
  onPickFolders: () => void;
  onPickWebsites: () => void;
}) {
  const managedDataSources = dataSources.filter(
    (ds) => ds.connectorProvider && ds.connectorProvider !== "webcrawler"
  );

  // We want to display the folders & websites as a single parent entry
  // so we take them out of the list of data sources
  const shouldDisplayFolderEntry = dataSources.some(
    (ds) => !ds.connectorProvider
  );
  const shouldDisplayWebsiteEntry = dataSources.some(
    (ds) => ds.connectorProvider === "webcrawler"
  );

  return (
    <Transition show={show} className="mx-auto max-w-6xl">
      <Page>
        <Page.Header
          title="Select Data Sources in"
          icon={CloudArrowLeftRightIcon}
        />
        {orderDatasourceByImportance(managedDataSources).map((ds) => (
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
        {shouldDisplayFolderEntry && (
          <Item.Navigation
            label="Folders"
            icon={FolderIcon}
            onClick={onPickFolders}
          />
        )}
        {shouldDisplayWebsiteEntry && (
          <Item.Navigation
            label="Websites"
            icon={GlobeAltIcon}
            onClick={onPickWebsites}
          />
        )}
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
  const { parentsById, setParentsById } = useParentResourcesById({
    owner,
    dataSource,
    selectedResources,
  });

  const selectedParents = [
    ...new Set(Object.values(parentsById).flatMap((c) => [...c])),
  ];

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
                  onClick={() => {
                    toggleSelectAll();
                    setParentsById({});
                  }}
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
                showExpand={
                  CONNECTOR_CONFIGURATIONS[
                    dataSource.connectorProvider as ConnectorProvider
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
                  onSelectChange(node, selected);
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

function FolderOrWebsiteResourceSelector({
  owner,
  type,
  dataSources,
  selectedNodes,
  onSelectChange,
}: {
  owner: WorkspaceType;
  type: "folder" | "website";
  dataSources: DataSourceType[];
  selectedNodes: AssistantBuilderDataSourceConfiguration[];
  onSelectChange: (
    ds: DataSourceType,
    selected: boolean,
    resource?: ContentNode
  ) => void;
}) {
  const [query, setQuery] = useState<string>("");

  const filteredDataSources = dataSources.filter((ds) => {
    return subFilter(query.toLowerCase(), ds.name.toLowerCase());
  });

  return (
    <Transition show={!!owner} className="mx-auto max-w-6xl pb-8">
      <Page>
        <Page.Header
          title={type === "folder" ? "Select Folders" : "Select Websites"}
          icon={type === "folder" ? FolderIcon : GlobeAltIcon}
          description={`Select the ${
            type === "folder" ? "folders" : "websites"
          } that will be used by the assistant as a source for its answers.`}
        />
        <Searchbar
          name="search"
          onChange={setQuery}
          value={query}
          placeholder="Search..."
        />
        <div className="flex flex-row gap-32">
          <div className="flex-1">
            <div className="flex flex-row pb-4 text-lg font-semibold text-element-900">
              <div>Select from available folders:</div>
            </div>
          </div>
        </div>
        <div>
          <Tree>
            {filteredDataSources.map((dataSource) => {
              const currentConfig = selectedNodes.find(
                (selectedNode) => selectedNode.dataSource.id === dataSource.id
              );
              return (
                <FolderOrWebsiteTree
                  key={dataSource.id}
                  owner={owner}
                  dataSource={dataSource}
                  type={type}
                  currentConfig={currentConfig}
                  onSelectChange={onSelectChange}
                />
              );
            })}
          </Tree>
        </div>
      </Page>
    </Transition>
  );
}

function FolderOrWebsiteTree({
  owner,
  dataSource,
  type,
  currentConfig,
  onSelectChange,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  type: "folder" | "website";
  currentConfig: AssistantBuilderDataSourceConfiguration | undefined;
  onSelectChange: (
    ds: DataSourceType,
    selected: boolean,
    resource?: ContentNode
  ) => void;
}) {
  const selectedResources = currentConfig?.selectedResources ?? [];

  const { parentsById, setParentsById } = useParentResourcesById({
    owner,
    dataSource,
    selectedResources,
  });

  const selectedParents = [
    ...new Set(Object.values(parentsById).flatMap((c) => [...c])),
  ];

  return (
    <Tree.Item
      type={type === "folder" ? "leaf" : "node"}
      label={dataSource.name}
      variant="folder"
      visual={type === "folder" ? <FolderIcon /> : <GlobeAltIcon />}
      className="whitespace-nowrap"
      checkbox={{
        checked: currentConfig?.isSelectAll ?? false,
        partialChecked: currentConfig
          ? !currentConfig.isSelectAll &&
            currentConfig.selectedResources?.length > 0
          : false,
        onChange: (checked) => {
          setParentsById({});
          onSelectChange(dataSource, checked);
        },
      }}
    >
      {type === "website" && (
        <DataSourceResourceSelectorTree
          showExpand
          owner={owner}
          dataSource={dataSource}
          parentIsSelected={currentConfig?.isSelectAll ?? false}
          selectedParents={selectedParents}
          onSelectChange={(resource, parents, selected) => {
            setParentsById((parentsById) => {
              const newParentsById = { ...parentsById };
              if (selected) {
                newParentsById[resource.internalId] = new Set(parents);
              } else {
                delete newParentsById[resource.internalId];
              }
              return newParentsById;
            });
            onSelectChange(dataSource, selected, resource);
          }}
          selectedResourceIds={selectedResources.map((r) => r.internalId)}
        />
      )}
    </Tree.Item>
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
      case "microsoft":
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
