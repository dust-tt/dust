import { ContextItem } from "@dust-tt/sparkle";
import { useWatch } from "react-hook-form";

import { DataSourceViewTagsFilterDropdown } from "@app/components/agent_builder/capabilities/shared/DataSourceViewTagsFilterDropdown";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import type { DataSourceBuilderTreeItemType } from "@app/components/data_source_view/context/types";
import { getVisualForTreeItem } from "@app/components/data_source_view/context/utils";
import { useTheme } from "@app/components/sparkle/ThemeContext";

function KnowledgeFooterItem({
  item,
}: {
  item: DataSourceBuilderTreeItemType;
}) {
  const { isDark } = useTheme();
  const VisualComponent = getVisualForTreeItem(item, isDark);

  return (
    <ContextItem
      key={item.path}
      title={item.name}
      visual={<ContextItem.Visual visual={VisualComponent} />}
    />
  );
}

export function SelectDataSourcesFilters() {
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });

  return (
    <div className="space-y-4">
      <div className="align-center flex flex-row justify-between">
        <h3 className="mb-2 text-lg font-semibold">Selected data source</h3>

        <DataSourceViewTagsFilterDropdown />
      </div>

      <div>
        <div className="rounded-xl bg-muted dark:bg-muted-night">
          <ContextItem.List className="max-h-40 overflow-x-scroll">
            {sources.in.map((item) => (
              <KnowledgeFooterItem key={item.path} item={item} />
            ))}
          </ContextItem.List>
        </div>
      </div>
    </div>
  );
}
