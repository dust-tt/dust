import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  ActionIncludeIcon,
  MultiPageSheet,
  MultiPageSheetContent,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { DescriptionSection } from "@app/components/agent_builder/capabilities/knowledge/shared/DescriptionSection";
import {
  getDataSourceConfigurations,
  getTimeFrame,
  hasDataSourceSelections,
  isValidPage,
} from "@app/components/agent_builder/capabilities/knowledge/shared/sheetUtils";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/knowledge/shared/TimeFrameSection";
import type {
  AgentBuilderAction,
  IncludeDataAgentBuilderAction,
} from "@app/components/agent_builder/types";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import type {
  DataSourceViewSelectionConfigurations,
  TimeFrame,
} from "@app/types";

const PAGE_IDS = {
  DATA_SOURCE_SELECTION: "data-source-selection",
  CONFIGURATION: "configuration",
} as const;

type PageId = (typeof PAGE_IDS)[keyof typeof PAGE_IDS];

interface AddIncludeDataSheetProps {
  onSave: (action: AgentBuilderAction) => void;
  isOpen: boolean;
  onClose: () => void;
  action?: AgentBuilderAction;
}

export function AddIncludeDataSheet({
  onSave,
  isOpen,
  onClose,
  action,
}: AddIncludeDataSheetProps) {
  const { owner, supportedDataSourceViews } = useAgentBuilderContext();
  const { spaces } = useSpacesContext();
  const [currentPageId, setCurrentPageId] = useState<PageId>(
    PAGE_IDS.DATA_SOURCE_SELECTION
  );
  const [description, setDescription] = useState(action?.description ?? "");
  const [dataSourceConfigurations, setDataSourceConfigurations] =
    useState<DataSourceViewSelectionConfigurations>(() =>
      getDataSourceConfigurations(action)
    );
  const [timeFrame, setTimeFrame] = useState<TimeFrame | null>(() =>
    getTimeFrame(action)
  );

  useEffect(() => {
    setDescription(action?.description ?? "");
    setDataSourceConfigurations(getDataSourceConfigurations(action));
    setTimeFrame(getTimeFrame(action));
  }, [action]);

  const handleClose = () => {
    onClose();
    setDescription("");
    setDataSourceConfigurations({});
    setTimeFrame(null);
    setCurrentPageId(PAGE_IDS.DATA_SOURCE_SELECTION);
  };

  const hasDataSources = hasDataSourceSelections(dataSourceConfigurations);

  const handleSave = () => {
    const includeDataAction: IncludeDataAgentBuilderAction = {
      id: action?.id || `include_data_${Date.now()}`,
      type: "INCLUDE_DATA",
      name: "Include Data",
      description,
      configuration: {
        type: "INCLUDE_DATA",
        dataSourceConfigurations,
        timeFrame,
      },
      noConfigurationRequired: false,
    };
    onSave(includeDataAction);
    handleClose();
  };

  const handlePageChange = (pageId: string) => {
    if (isValidPage(pageId, PAGE_IDS)) {
      setCurrentPageId(pageId);
    }
  };

  const pages: MultiPageSheetPage[] = [
    {
      id: PAGE_IDS.DATA_SOURCE_SELECTION,
      title: "Select Data Sources",
      description: "Choose which data sources to include data from",
      icon: ActionIncludeIcon,
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
    },
    {
      id: PAGE_IDS.CONFIGURATION,
      title: "Configure Include Data",
      description: "Set time range and describe what data to include",
      icon: ActionIncludeIcon,
      content: (
        <div className="space-y-6">
          <TimeFrameSection
            timeFrame={timeFrame}
            setTimeFrame={setTimeFrame}
            actionType="include"
          />
          <DescriptionSection
            title="Data Description"
            description="Describe what type of data you want to include from your selected data sources to provide context to the agent."
            label="Description"
            placeholder="Describe what data you want to include from your selected data sources..."
            value={description}
            onChange={setDescription}
            helpText="This description helps the agent understand what type of data to include as context."
          />
        </div>
      ),
    },
  ];

  return (
    <MultiPageSheet
      open={isOpen}
      onOpenChange={(open) => !open && handleClose()}
    >
      <MultiPageSheetContent
        pages={pages}
        currentPageId={currentPageId}
        onPageChange={handlePageChange}
        size="lg"
        onSave={handleSave}
        showNavigation={true}
        disableNext={
          currentPageId === PAGE_IDS.DATA_SOURCE_SELECTION && !hasDataSources
        }
        disableSave={!hasDataSources || !description.trim()}
      />
    </MultiPageSheet>
  );
}
