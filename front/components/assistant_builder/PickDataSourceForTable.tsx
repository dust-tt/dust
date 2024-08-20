import {
  GlobeAltIcon,
  Item,
  Page,
  Searchbar,
  ServerIcon,
} from "@dust-tt/sparkle";
import type { DataSourceType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import * as React from "react";
import { useState } from "react";

import { orderDatasourceByImportance } from "@app/lib/assistant";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { subFilter } from "@app/lib/utils";

export default function PickDataSourceForTable({
  dataSources,
  onPick,
}: {
  dataSources: DataSourceType[];
  onPick: (dataSource: DataSourceType) => void;
}) {
  const [query, setQuery] = useState<string>("");

  const filtered = dataSources.filter((ds) => {
    return subFilter(query.toLowerCase(), ds.name.toLowerCase());
  });

  return (
    <Transition show={true} className="mx-auto max-w-6xl">
      <Page>
        <Page.Header title="Select a Table in" icon={ServerIcon} />
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
                : GlobeAltIcon
            }
            key={ds.id}
            onClick={() => {
              onPick(ds);
            }}
          />
        ))}
      </Page>
    </Transition>
  );
}
