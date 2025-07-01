import type { ComponentType, Dispatch, SetStateAction } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import type { DataSourceViewSelectionConfigurations } from "@app/types";

interface DataSourceSelectionPageProps {
  icon: ComponentType<{ className?: string }>;
  dataSourceConfigurations: DataSourceViewSelectionConfigurations;
  setDataSourceConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
}

export function DataSourceSelectionPage({
  icon: Icon,
  dataSourceConfigurations,
  setDataSourceConfigurations,
}: DataSourceSelectionPageProps) {
  const { owner, supportedDataSourceViews } = useAgentBuilderContext();
  const { spaces } = useSpacesContext();

  return {
    id: "data-source-selection",
    title: "Select Data Sources",
    description: "Choose which data sources to use",
    icon: Icon,
    content: (
      <div className="space-y-4">
        <div
          id="dataSourceViewsSelector"
          className="overflow-y-auto scrollbar-hide"
        >
          <DataSourceViewsSpaceSelector
            useCase="assistantBuilder"
            dataSourceViews={supportedDataSourceViews}
            allowedSpaces={spaces}
            owner={owner}
            selectionConfigurations={dataSourceConfigurations}
            setSelectionConfigurations={setDataSourceConfigurations}
            viewType="document"
            isRootSelectable={true}
          />
        </div>
      </div>
    ),
  };
}
