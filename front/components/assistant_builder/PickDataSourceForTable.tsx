import {
  GlobeAltIcon,
  Item,
  Page,
  Searchbar,
  ServerIcon,
} from "@dust-tt/sparkle";
import type { DataSourceViewType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import * as React from "react";
import { useContext, useMemo, useState } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import { orderDatasourceViewByImportance } from "@app/lib/assistant";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import {
  canContainStructuredData,
  getDisplayNameForDataSource,
} from "@app/lib/data_sources";
import { subFilter } from "@app/lib/utils";

export default function PickDataSourceForTable({
  onPick,
}: {
  onPick: (source: DataSourceViewType) => void;
}) {
  const { dataSourceViews } = useContext(AssistantBuilderContext);

  const supportedDataSourceViews = useMemo(
    () =>
      dataSourceViews.filter((dsView) =>
        canContainStructuredData(dsView.dataSource)
      ),
    [dataSourceViews]
  );

  const [query, setQuery] = useState<string>("");

  const nameFilter = (dsv: DataSourceViewType) => {
    return subFilter(query.toLowerCase(), dsv.dataSource.name.toLowerCase());
  };

  return (
    <Transition show className="mx-auto max-w-6xl">
      <Page>
        <Page.Header title="Select a Table in" icon={ServerIcon} />
        <Searchbar
          name="search"
          onChange={setQuery}
          value={query}
          placeholder="Search..."
        />
        {orderDatasourceViewByImportance(
          supportedDataSourceViews.filter((dsView) => nameFilter(dsView))
        ).map((dsView) => (
          <Item.Navigation
            label={getDisplayNameForDataSource(dsView.dataSource)}
            icon={getConnectorProviderLogoWithFallback(
              dsView.dataSource.connectorProvider,
              GlobeAltIcon
            )}
            key={dsView.sId}
            onClick={() => {
              onPick(dsView);
            }}
          />
        ))}
      </Page>
    </Transition>
  );
}
