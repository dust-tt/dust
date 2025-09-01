import { Button, Chip, ContentMessage, FolderIcon, PlusIcon } from "@dust-tt/sparkle";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import type { DataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import type { DataSourceViewType } from "@app/types";

interface SelectedDataSourcesSectionProps {
  onEditDataSources?: () => void;
  isEditMode?: boolean;
}

function getDataSourceIcon(dataSourceView: DataSourceViewType) {
  // Check if the data source has a connector provider with a custom logo
  if (
    dataSourceView.dataSource?.connectorProvider &&
    CONNECTOR_CONFIGURATIONS[dataSourceView.dataSource.connectorProvider]
  ) {
    return CONNECTOR_CONFIGURATIONS[
      dataSourceView.dataSource.connectorProvider
    ].getLogoComponent();
  }
  
  // Default to folder icon for data sources without a specific connector
  return FolderIcon;
}

export function SelectedDataSourcesSection({
  onEditDataSources,
  isEditMode = false,
}: SelectedDataSourcesSectionProps) {
  const { watch } = useFormContext<MCPFormData>();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  
  // For Canvas, the form is extended with a sources field that's not in the MCPFormData type
  // We need to use watch with any type and validate the structure
  const watchedSources = watch("sources" as any);
  
  const selectedDataSources = useMemo(() => {
    // Ensure sources has the proper structure
    let normalizedSources: DataSourceBuilderTreeType;
    
    if (watchedSources && typeof watchedSources === 'object' && 'in' in watchedSources && 'notIn' in watchedSources) {
      normalizedSources = watchedSources as DataSourceBuilderTreeType;
    } else {
      normalizedSources = { in: [], notIn: [] };
    }
    
    if (!normalizedSources.in || normalizedSources.in.length === 0) {
      return [];
    }
    
    // Map the selected source items to data source views
    const results: Array<{ name: string; sId: string; dataSourceView: DataSourceViewType }> = [];
    
    for (const item of normalizedSources.in) {
      // Check if this is a data source type item
      if (item.type === "data_source" && "dataSourceView" in item) {
        results.push({
          name: getDataSourceNameFromView(item.dataSourceView),
          sId: item.dataSourceView.sId,
          dataSourceView: item.dataSourceView,
        });
      } else if (item.type === "node" && "node" in item) {
        // If a specific node/folder is selected, we need to find its parent data source
        // Parse from the path: "root/spaceId/data_sources/dataSourceViewId/..."
        const pathParts = item.path.split("/");
        if (pathParts.length >= 4 && pathParts[2] === "data_sources") {
          const dataSourceViewId = pathParts[3];
          const dataSourceView = supportedDataSourceViews.find(
            (dsv) => dsv.sId === dataSourceViewId
          );
          if (dataSourceView) {
            // Check if we already added this data source
            if (!results.find(r => r.sId === dataSourceView.sId)) {
              results.push({
                name: getDataSourceNameFromView(dataSourceView),
                sId: dataSourceView.sId,
                dataSourceView: dataSourceView,
              });
            }
          }
        }
      }
      // We could also handle "space" and "category" types if needed
    }
    
    return results;
  }, [watchedSources, supportedDataSourceViews]);

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
          {selectedDataSources.map((ds) => {
            if (!ds) {
              return null;
            }
            const Icon = getDataSourceIcon(ds.dataSourceView);
            return (
              <Chip
                key={ds.sId}
                label={ds.name}
                size="sm"
                icon={Icon}
              />
            );
          })}
        </div>
      ) : (
        <ContentMessage
          title="No data sources selected"
          variant="outline"
          size="sm"
        >
          {isEditMode ? (
            <div className="flex flex-col gap-2">
              <p>Canvas can access your data sources for better context. This is optional.</p>
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