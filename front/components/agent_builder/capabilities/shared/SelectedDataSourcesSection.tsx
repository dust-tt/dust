import {
  Button,
  ContentMessage,
  ContextItem,
  PlusIcon,
} from "@dust-tt/sparkle";
import { useMemo } from "react";
import { useWatch } from "react-hook-form";

import { DataSourceFilterContextItem } from "@app/components/agent_builder/capabilities/shared/DataSourceFilterContextItem";
import { extractDataSourceViews } from "@app/components/agent_builder/capabilities/shared/utils/dataSourceUtils";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { pluralize } from "@app/types";

interface SelectedDataSourcesSectionProps {
  onEditDataSources?: () => void;
  isEditMode?: boolean;
}

export function SelectedDataSourcesSection({
  onEditDataSources,
  isEditMode = false,
}: SelectedDataSourcesSectionProps) {
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });

  const dataSourceViews = useMemo(
    () => extractDataSourceViews(sources),
    [sources]
  );

  const selectedDataSourcesList = Object.values(dataSourceViews);

  if (!isEditMode && selectedDataSourcesList.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="heading-base font-semibold text-foreground dark:text-foreground-night">
          Selected data source{pluralize(Object.values(dataSourceViews).length)}
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
