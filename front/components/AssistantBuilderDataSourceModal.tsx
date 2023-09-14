import {
  CloudArrowDownIcon,
  IconButton,
  Item,
  Modal,
  PageHeader,
  TrashIcon,
  XCircleIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import type * as React from "react";
import { useEffect, useState } from "react";

import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { ConnectorProvider } from "@app/lib/connectors_api";
import { CONNECTOR_PROVIDER_TO_RESOURCE_NAME } from "@app/pages/w/[wId]/builder/assistants/new";
import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

export default function AssistantBuilderDataSourceModal({
  isOpen,
  setOpen,
  owner,
  dataSources,
  onSave,
  dataSourceToManage,
  onDelete,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  dataSources: DataSourceType[];
  onSave: (
    dataSource: DataSourceType,
    selectedResources: Record<string, string>
  ) => void;
  dataSourceToManage: {
    dataSource: DataSourceType;
    selectedResources: Record<string, string>;
  } | null;
  onDelete?: () => void;
}) {
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);
  const [selectedResources, setSelectedResources] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (dataSourceToManage) {
      setSelectedDataSource(dataSourceToManage.dataSource);
      setSelectedResources(dataSourceToManage.selectedResources);
    }
  }, [dataSourceToManage]);

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
        onSave(selectedDataSource, selectedResources);
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
                onSave(ds, {});
                onClose();
              }
            }}
          />
        ) : (
          <DataSourceResourceSelector
            dataSource={dataSourceToManage?.dataSource ?? selectedDataSource}
            owner={owner}
            selectedResources={selectedResources}
            onSelectChange={({ resourceId, resourceName }, selected) => {
              const newSelectedResources = { ...selectedResources };
              if (selected) {
                newSelectedResources[resourceId] = resourceName;
              } else {
                delete newSelectedResources[resourceId];
              }
              setSelectedResources(newSelectedResources);
            }}
            onDelete={
              onDelete
                ? () => {
                    onDelete();
                    onClose();
                  }
                : undefined
            }
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
  onDelete,
}: {
  dataSource: DataSourceType | null;
  owner: WorkspaceType;
  selectedResources: Record<string, string>;
  onSelectChange: (
    resource: { resourceId: string; resourceName: string },
    selected: boolean
  ) => void;
  onDelete?: () => void;
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
              onSelectChange={onSelectChange}
            />
          </div>
          <div className="sticky top-16 hidden h-full flex-1 md:block">
            <div className="flex flex-row">
              {onDelete && (
                <IconButton
                  icon={TrashIcon}
                  variant="warning"
                  onClick={onDelete}
                  className="mr-2"
                  size="sm"
                />
              )}
              <div className="text-lg font-semibold text-element-900">
                Selected{" "}
                {CONNECTOR_PROVIDER_TO_RESOURCE_NAME[
                  dataSource.connectorProvider as ConnectorProvider
                ]?.plural ?? "resources"}
                :
              </div>
            </div>
            <ul className="pt-4">
              {Object.entries(selectedResources).map(([id, name]) => (
                <li key={id}>
                  <div className="flex flex-row space-x-2">
                    <div className="font-normal text-element-700">{name}</div>
                    <IconButton
                      icon={XCircleIcon}
                      variant="warning"
                      size="xs"
                      onClick={() => {
                        onSelectChange(
                          { resourceId: id, resourceName: name },
                          false
                        );
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Transition>
  );
}
