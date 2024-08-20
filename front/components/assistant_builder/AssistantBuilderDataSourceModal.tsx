import { Modal } from "@dust-tt/sparkle";
import type {
  ContentNode,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useEffect, useState } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import DataSourceResourceSelector from "@app/components/assistant_builder/DataSourceResourceSelector";
import FolderOrWebsiteResourceSelector from "@app/components/assistant_builder/FolderOrWebsiteResourceSelector";
import PickDataSource from "@app/components/assistant_builder/PickDataSource";
import type {
  AssistantBuilderDataSourceConfiguration,
  AssistantBuilderDataSourceConfigurations,
} from "@app/components/assistant_builder/types";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";

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
  onSave,
  initialDataSourceConfigurations,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  onSave: (dsConfigs: AssistantBuilderDataSourceConfigurations) => void;
  initialDataSourceConfigurations: AssistantBuilderDataSourceConfigurations;
}) {
  const { dataSources } = useContext(AssistantBuilderContext);

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
                          // TODO(GROUPS_INFRA) Replace with DataSourceViewType once the UI has it.
                          dataSourceView: null,
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
