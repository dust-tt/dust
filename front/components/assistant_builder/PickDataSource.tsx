import {
  CloudArrowDownIcon,
  CloudArrowLeftRightIcon,
  FolderIcon,
  GlobeAltIcon,
  Item,
  Page,
} from "@dust-tt/sparkle";
import type { DataSourceViewType } from "@dust-tt/types";
import { isFolder, isManaged, isWebsite } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { useContext } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import { orderDatasourceViewByImportance } from "@app/lib/assistant";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";

export default function PickDataSource({
  onPick,
  onPickFolders,
  onPickWebsites,
}: {
  onPick: (dataSourceView: DataSourceViewType) => void;
  onPickFolders: () => void;
  onPickWebsites: () => void;
}) {
  const { dataSourceViews } = useContext(AssistantBuilderContext);

  // We'll use dataSourceViews to get the data sources that are managed
  const managedDataSourceViews = dataSourceViews.filter((dsView) =>
    isManaged(dsView.dataSource)
  );

  // We want to display the folders & websites as a single parent entry
  // so we take them out of the list of data sources
  const shouldDisplayFolderEntry = dataSourceViews.some((dsView) =>
    isFolder(dsView.dataSource)
  );
  const shouldDisplayWebsiteEntry = dataSourceViews.some((dsView) =>
    isWebsite(dsView.dataSource)
  );

  return (
    <Transition show className="mx-auto max-w-6xl">
      <Page>
        <Page.Header
          title="Select Data Sources in"
          icon={CloudArrowLeftRightIcon}
        />
        {orderDatasourceViewByImportance(managedDataSourceViews).map(
          (dsView) => (
            <Item.Navigation
              label={getDisplayNameForDataSource(dsView.dataSource)}
              icon={getConnectorProviderLogoWithFallback(
                dsView.dataSource.connectorProvider,
                CloudArrowDownIcon
              )}
              key={dsView.sId}
              onClick={() => {
                onPick(dsView);
              }}
            />
          )
        )}
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
