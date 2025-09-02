import {
  Button,
  ContentMessage,
  ContextItem,
  PlusIcon,
} from "@dust-tt/sparkle";
import { useMemo } from "react";
import { useWatch } from "react-hook-form";

import type { DataSourceFilterItem } from "@app/components/agent_builder/capabilities/shared/DataSourceFilterContextItem";
import { DataSourceFilterContextItem } from "@app/components/agent_builder/capabilities/shared/DataSourceFilterContextItem";
import type { DataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";

interface SelectedDataSourcesSectionProps {
  onEditDataSources?: () => void;
  isEditMode?: boolean;
}

export function SelectedDataSourcesSection({
  onEditDataSources,
  isEditMode = false,
}: SelectedDataSourcesSectionProps) {
  const watchedSources = useWatch({ name: "sources" });

  const dataSourceViews = useMemo(() => {
    // Ensure sources has the proper structure
    let normalizedSources: DataSourceBuilderTreeType;

    if (
      watchedSources &&
      typeof watchedSources === "object" &&
      "in" in watchedSources &&
      "notIn" in watchedSources
    ) {
      normalizedSources = watchedSources as DataSourceBuilderTreeType;
    } else {
      normalizedSources = { in: [], notIn: [] };
    }

    if (!normalizedSources.in || normalizedSources.in.length === 0) {
      return {};
    }

    // Map the selected source items to data source views
    const results: Record<string, DataSourceFilterItem> = {};

    for (const item of normalizedSources.in) {
      // Check if this is a data source type item
      if (item.type === "data_source" && "dataSourceView" in item) {
        const key = item.dataSourceView.dataSource.dustAPIDataSourceId;
        results[key] = {
          dataSourceView: item.dataSourceView,
        };
      } else if (item.type === "node" && "node" in item) {
        // For nodes, use the data source view from the node
        const key = item.node.dataSourceView.dataSource.dustAPIDataSourceId;
        results[key] = {
          dataSourceView: item.node.dataSourceView,
        };
      }
      // We could also handle "space" and "category" types if needed
    }

    return results;
  }, [watchedSources]);

  const selectedDataSourcesList = Object.values(dataSourceViews);

  if (!isEditMode && selectedDataSourcesList.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="heading-base font-semibold text-foreground dark:text-foreground-night">
          Selected Data Sources
        </div>
        {selectedDataSourcesList.length > 0 && (
          <Button
            label="Manage data source"
            size="xs"
            variant="outline"
            onClick={onEditDataSources}
          />
        )}
      </div>

      {selectedDataSourcesList.length > 0 ? (
        <div className="rounded-xl bg-muted dark:bg-muted-night">
          <ContextItem.List className="max-h-40 overflow-y-auto">
            {selectedDataSourcesList.map((item) => (
              <DataSourceFilterContextItem
                key={item.dataSourceView.id}
                item={item}
              />
            ))}
          </ContextItem.List>
        </div>
      ) : (
        <ContentMessage
          title="No data sources selected"
          variant="outline"
          size="sm"
        >
          {isEditMode ? (
            <div className="flex flex-col gap-2">
              <p>
                Canvas can access your data sources for better context. This is
                optional.
              </p>
              {onEditDataSources && (
                <Button
                  label="Select Data Sources"
                  size="sm"
                  variant="outline"
                  icon={PlusIcon}
                  onClick={onEditDataSources}
                />
              )}
            </div>
          ) : (
            "Canvas will operate without data source context."
          )}
        </ContentMessage>
      )}
    </div>
  );
}
