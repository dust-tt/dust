import {
  CloudArrowDownIcon,
  DriveLogo,
  GithubLogo,
  Item,
  Modal,
  NotionLogo,
  PageHeader,
  SlackLogo,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import type * as React from "react";
import { useState } from "react";

import { ConnectorProvider } from "@app/lib/connectors_api";
import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

import { CONNECTOR_TYPE_TO_SHOW_EXPAND } from "./ConnectorPermissionsModal";
import DataSourceResourceSelectorTree from "./DataSourceResourceSelectorTree";

const DISPLAY_NAME_BY_CONNECTOR_PROVIDER: Record<ConnectorProvider, string> = {
  notion: "Notion",
  slack: "Slack",
  github: "GitHub",
  google_drive: "Google Drive",
};

const LOGO_BY_CONNECTOR_PROVIDER: Record<
  ConnectorProvider,
  (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element
> = {
  notion: NotionLogo,
  slack: SlackLogo,
  github: GithubLogo,
  google_drive: DriveLogo,
};

export default function AssistantBuilderDataSourceModal({
  isOpen,
  setOpen,
  owner,
  dataSources,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  dataSources: DataSourceType[];
}) {
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setOpen(false);
        setTimeout(() => {
          setSelectedDataSource(null);
        }, 200);
      }}
      hasChanged={false}
      isFullScreen={true}
      title="Add a data source"
    >
      <div className="mb-16 flex justify-center">
        <div className="flex w-3/4 flex-col pt-6 sm:w-1/2">
          <PickDataSource
            dataSources={dataSources}
            show={!selectedDataSource}
            onPick={(ds) => {
              setSelectedDataSource(ds);
            }}
          />
          <DataSourceResourceSelector
            dataSource={selectedDataSource}
            owner={owner}
          />
        </div>
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
    <Transition show={show}>
      <div className="flex flex-col">
        <div className="mb-6">
          <PageHeader
            title="Select a new data source"
            icon={CloudArrowDownIcon}
            description="What kind of data source do you want to add?"
          />
        </div>

        {dataSources
          .filter((ds) => ds.connectorProvider)
          .map((ds) => (
            <Item
              // "as" is fine here because we're filtering
              // right above
              label={
                DISPLAY_NAME_BY_CONNECTOR_PROVIDER[
                  ds.connectorProvider as ConnectorProvider
                ]
              }
              icon={
                LOGO_BY_CONNECTOR_PROVIDER[
                  ds.connectorProvider as ConnectorProvider
                ]
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
}: {
  dataSource: DataSourceType | null;
  owner: WorkspaceType;
}) {
  const [selectedParentIds, setSelectedParentIds] = useState<Set<string>>(
    new Set()
  );
  return (
    <Transition show={!!dataSource} className={"pb-8"}>
      <div className="mb-6">
        <PageHeader
          title={`Select Data sources in ${
            DISPLAY_NAME_BY_CONNECTOR_PROVIDER[
              dataSource?.connectorProvider as ConnectorProvider
            ]
          }`}
          icon={
            LOGO_BY_CONNECTOR_PROVIDER[
              dataSource?.connectorProvider as ConnectorProvider
            ]
          }
          description="Select the files and folders that will be used by the assistant as a source for its answers."
        />
      </div>
      {dataSource && (
        <DataSourceResourceSelectorTree
          owner={owner}
          dataSource={dataSource}
          expandable={
            CONNECTOR_TYPE_TO_SHOW_EXPAND[
              dataSource.connectorProvider as ConnectorProvider
            ]
          }
          selectedParentIds={selectedParentIds}
          onSelectChange={(parentId, selected) => {
            if (selected) {
              selectedParentIds.add(parentId);
            } else {
              selectedParentIds.delete(parentId);
            }
            setSelectedParentIds(new Set(selectedParentIds));
          }}
        />
      )}
    </Transition>
  );
}
