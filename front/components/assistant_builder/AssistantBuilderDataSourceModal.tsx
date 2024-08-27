import { Modal } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  WorkspaceType,
} from "@dust-tt/types";
import { isFolder, isWebsite } from "@dust-tt/types";
import { useEffect, useMemo, useState } from "react";

import DataSourceViewResourceSelector from "@app/components/assistant_builder/DataSourceViewResourceSelector";
import FolderOrWebsiteResourceSelector from "@app/components/assistant_builder/FolderOrWebsiteResourceSelector";
import PickDataSource from "@app/components/assistant_builder/PickDataSource";
import type {
  AssistantBuilderDataSourceConfiguration,
  AssistantBuilderDataSourceConfigurations,
} from "@app/components/assistant_builder/types";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";

type DisplayMode =
  | "PickKind" // Choose type of source
  | "SelectFromManaged" // Once a source is chosen, select resources from it, here is from managed
  | "SelectFromFolder" // Select folders
  | "SelectFromWebsite"; // Select websites

function getConfiguration(
  configurations: AssistantBuilderDataSourceConfigurations,
  dataSourceView: DataSourceViewType
): AssistantBuilderDataSourceConfiguration {
  return configurations[dataSourceView.sId];
}

function getUpdatedConfigurations(
  currentConfigurations: AssistantBuilderDataSourceConfigurations,
  dataSourceView: DataSourceViewType,
  selected: boolean,
  node: LightContentNode
) {
  const oldConfiguration =
    currentConfigurations[dataSourceView.sId] ||
    ({
      dataSourceView,
      selectedResources: [],
      isSelectAll: false,
    } as AssistantBuilderDataSourceConfiguration);

  const newConfiguration = {
    ...oldConfiguration,
  };

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
    newConfigurations[dataSourceView.sId] = newConfiguration;
  } else {
    delete newConfigurations[dataSourceView.sId];
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
  // Local modal state, that replaces the action's datasourceConfigurations state in the global
  // assistant builder state when the modal is saved.
  const [dataSourceConfigurations, setDataSourceConfigurations] =
    useState<AssistantBuilderDataSourceConfigurations | null>(null);

  // Navigation state
  const [selectedDataSourceView, setSelectedDataSourceView] =
    useState<DataSourceViewType | null>(null);

  const [displayMode, setDisplayMode] = useState<DisplayMode>("PickKind");

  const onSelectChangeManaged = useMemo(
    () =>
      (
        dsView: DataSourceViewType,
        node: LightContentNode,
        selected: boolean
      ) => {
        setDataSourceConfigurations((currentConfigurations) => {
          if (currentConfigurations === null) {
            // Unreachable
            return null;
          }

          return getUpdatedConfigurations(
            currentConfigurations,
            dsView,
            selected,
            node
          );
        });
      },
    []
  );

  const onSelectChangeFolderOrWebsite = useMemo(
    () =>
      (
        dsView: DataSourceViewType,
        selected: boolean,
        contentNode?: LightContentNode
      ) => {
        setDataSourceConfigurations((currentConfigurations) => {
          if (currentConfigurations === null) {
            // Unreachable
            return null;
          }

          if (contentNode === undefined) {
            if (selected) {
              return {
                ...currentConfigurations,
                [dsView.sId]: {
                  dataSourceView: dsView,
                  selectedResources: [],
                  isSelectAll: true,
                },
              };
            } else {
              const newConfigurations = { ...currentConfigurations };
              delete newConfigurations[dsView.sId];
              return newConfigurations;
            }
          }

          return getUpdatedConfigurations(
            currentConfigurations,
            dsView,
            selected,
            contentNode
          );
        });
      },
    []
  );

  const onToggleSelectAll = useMemo(
    () => (dsView: DataSourceViewType) => {
      setDataSourceConfigurations((currentConfigurations) => {
        if (currentConfigurations === null) {
          // Unreachable
          return null;
        }

        const oldConfiguration =
          currentConfigurations[dsView.sId] ||
          ({
            dataSourceView: dsView,
            selectedResources: [],
            isSelectAll: false,
          } as AssistantBuilderDataSourceConfiguration);

        const newConfiguration = {
          ...oldConfiguration,
          isSelectAll: !oldConfiguration.isSelectAll,
          selectedResources: [],
        };

        const newConfigurations = { ...currentConfigurations };

        if (
          newConfiguration.isSelectAll ||
          newConfiguration.selectedResources.length > 0
        ) {
          newConfigurations[dsView.sId] = newConfiguration;
        } else {
          delete newConfigurations[dsView.sId];
        }

        return {
          ...currentConfigurations,
          [dsView.sId]: newConfiguration,
        };
      });
    },
    []
  );

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
      setSelectedDataSourceView(null);
      setDisplayMode("PickKind");
    }
  }, [dataSourceConfigurations, initialDataSourceConfigurations, isOpen]);

  if (!dataSourceConfigurations) {
    return null;
  }

  const alreadySelectedFolders = Object.values(dataSourceConfigurations).filter(
    (ds) => isFolder(ds.dataSourceView.dataSource)
  );

  const alreadySelectedWebsites = Object.values(
    dataSourceConfigurations
  ).filter((ds) => isWebsite(ds.dataSourceView.dataSource));

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        // If we are in the PickKind mode, we close the modal, otherwise we go back to the PickKind mode
        if (displayMode === "PickKind") {
          setOpen(false);
        }
        // We are one of the selection modes, we didn't save so we cancel the changes and go back to the PickKind mode
        else {
          setDataSourceConfigurations(initialDataSourceConfigurations);
          setDisplayMode("PickKind");
        }
      }}
      onSave={() => {
        onSave(dataSourceConfigurations);
        setOpen(false);
      }}
      hasChanged={displayMode !== "PickKind"}
      variant="full-screen"
      title="Manage data sources selection"
    >
      <div className="w-full pt-12">
        {displayMode === "PickKind" && (
          <PickDataSource
            onPick={(dsView) => {
              setSelectedDataSourceView(dsView);
              setDisplayMode("SelectFromManaged");
            }}
            onPickFolders={() => {
              setDisplayMode("SelectFromFolder");
            }}
            onPickWebsites={() => {
              setDisplayMode("SelectFromWebsite");
            }}
          />
        )}

        {displayMode === "SelectFromFolder" && (
          <FolderOrWebsiteResourceSelector
            owner={owner}
            type="folder"
            selectedNodes={alreadySelectedFolders}
            onSelectChange={onSelectChangeFolderOrWebsite}
          />
        )}

        {displayMode === "SelectFromWebsite" && (
          <FolderOrWebsiteResourceSelector
            owner={owner}
            type="website"
            selectedNodes={alreadySelectedWebsites}
            onSelectChange={onSelectChangeFolderOrWebsite}
          />
        )}

        {displayMode === "SelectFromManaged" && selectedDataSourceView && (
          <DataSourceViewResourceSelector
            dataSourceView={selectedDataSourceView}
            owner={owner}
            selectedResources={
              getConfiguration(dataSourceConfigurations, selectedDataSourceView)
                ?.selectedResources ?? []
            }
            isSelectAll={
              getConfiguration(dataSourceConfigurations, selectedDataSourceView)
                ?.isSelectAll ?? false
            }
            onSelectChange={onSelectChangeManaged}
            toggleSelectAll={onToggleSelectAll}
          />
        )}
      </div>
    </Modal>
  );
}
