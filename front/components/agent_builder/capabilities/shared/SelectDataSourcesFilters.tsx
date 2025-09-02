import { Button, ContextItem } from "@dust-tt/sparkle";
import { useMemo } from "react";
import { useWatch } from "react-hook-form";

import { DataSourceFilterContextItem } from "@app/components/agent_builder/capabilities/shared/DataSourceFilterContextItem";
import { DataSourceViewTagsFilterDropdown } from "@app/components/agent_builder/capabilities/shared/DataSourceViewTagsFilterDropdown";
import { extractDataSourceViews } from "@app/components/agent_builder/capabilities/shared/utils/dataSourceUtils";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { CONFIGURATION_SHEET_PAGE_IDS } from "@app/components/agent_builder/types";
import { useKnowledgePageContext } from "@app/components/data_source_view/context/PageContext";
import { pluralize } from "@app/types";

export function SelectDataSourcesFilters() {
  const { setSheetPageId } = useKnowledgePageContext();
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });

  const dataSourceViews = useMemo(
    () => extractDataSourceViews(sources),
    [sources]
  );

  return (
    <div className="space-y-4">
      <div className="align-center flex flex-row justify-between">
        <h3 className="mb-2 text-lg font-semibold">
          Selected data source{pluralize(Object.values(dataSourceViews).length)}
        </h3>

        <div className="flex flex-row items-center space-x-2">
          <Button
            label="Manage selection"
            onClick={() =>
              setSheetPageId(CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION)
            }
          />
          <DataSourceViewTagsFilterDropdown />
        </div>
      </div>

      <div>
        <div className="rounded-xl bg-muted dark:bg-muted-night">
          <ContextItem.List className="max-h-40 overflow-x-scroll">
            {Object.values(dataSourceViews).map((item) => (
              <DataSourceFilterContextItem
                key={item.dataSourceView.id}
                item={item}
              />
            ))}
          </ContextItem.List>
        </div>
      </div>
    </div>
  );
}
