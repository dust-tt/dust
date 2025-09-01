import { Button, Chip, ContentMessage, FolderIcon, PlusIcon } from "@dust-tt/sparkle";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import type { DataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import { getDataSourceNameFromView } from "@app/lib/data_sources";

interface SelectedDataSourcesSectionProps {
  onEditDataSources?: () => void;
  isEditMode?: boolean;
}

export function SelectedDataSourcesSection({
  onEditDataSources,
  isEditMode = false,
}: SelectedDataSourcesSectionProps) {
  const { watch } = useFormContext<MCPFormData>();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  
  const sources = watch("sources") as DataSourceBuilderTreeType | undefined;
  
  const selectedDataSources = useMemo(() => {
    if (!sources?.in || sources.in.length === 0) {
      return [];
    }
    
    // Map the selected source paths to data source views
    return sources.in.map((item) => {
      // Parse the path to get the data source view ID
      const pathParts = item.path.split("/");
      if (pathParts.length >= 4 && pathParts[2] === "data_sources") {
        const dataSourceViewId = pathParts[3];
        const dataSourceView = supportedDataSourceViews.find(
          (dsv) => dsv.sId === dataSourceViewId
        );
        if (dataSourceView) {
          return {
            name: getDataSourceNameFromView(dataSourceView),
            sId: dataSourceView.sId,
          };
        }
      }
      return null;
    }).filter(Boolean);
  }, [sources, supportedDataSourceViews]);

  if (!isEditMode && (!selectedDataSources || selectedDataSources.length === 0)) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-element-900">
          Selected Data Sources
        </div>
        {isEditMode && onEditDataSources && (
          <Button
            label="Edit"
            size="xs"
            variant="outline"
            onClick={onEditDataSources}
          />
        )}
      </div>
      
      {selectedDataSources.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedDataSources.map((ds) => (
            ds && (
              <Chip
                key={ds.sId}
                label={ds.name}
                size="sm"
                icon={FolderIcon}
                color="slate"
              />
            )
          ))}
        </div>
      ) : (
        <ContentMessage
          title="No data sources selected"
          variant="slate"
          size="sm"
        >
          {isEditMode ? (
            <div className="flex flex-col gap-2">
              <p>Canvas can access data sources to provide better context.</p>
              {onEditDataSources && (
                <Button
                  label="Add Data Sources"
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