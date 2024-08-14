import {
  CloudArrowDownIcon,
  CloudArrowLeftRightIcon,
  FolderIcon,
  GlobeAltIcon,
  Item,
  Page,
} from "@dust-tt/sparkle";
import type { DataSourceType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";

import { orderDatasourceByImportance } from "@app/lib/assistant";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";

export default function PickDataSource({
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
