import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  ActionIncludeIcon,
  MultiPageSheet,
  MultiPageSheetContent,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DataSourceSelectionPage } from "@app/components/agent_builder/capabilities/knowledge/shared/DataSourceSelectionPage";
import { DescriptionSection } from "@app/components/agent_builder/capabilities/knowledge/shared/DescriptionSection";
import {
  getDataSourceConfigurations,
  getTimeFrame,
  hasDataSourceSelections,
  isValidPage,
} from "@app/components/agent_builder/capabilities/knowledge/shared";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/knowledge/shared/TimeFrameSection";
import type {
  AgentBuilderAction,
  IncludeDataAgentBuilderAction,
} from "@app/components/agent_builder/types";
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

  const handleClose = useCallback(() => {
    onClose();
    setDescription("");
    setDataSourceConfigurations({});
    setTimeFrame(null);
    setCurrentPageId(PAGE_IDS.DATA_SOURCE_SELECTION);
  }, [onClose]);

  const hasDataSources = useMemo(() => {
    return hasDataSourceSelections(dataSourceConfigurations);
  }, [dataSourceConfigurations]);

  const handleSave = useCallback(() => {
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
  }, [
    action?.id,
    description,
    dataSourceConfigurations,
    timeFrame,
    onSave,
    handleClose,
  ]);

  const handlePageChange = useCallback((pageId: string) => {
    if (isValidPage(pageId, PAGE_IDS)) {
      setCurrentPageId(pageId);
    }
  }, []);

  const dataSourcePage = DataSourceSelectionPage({
    icon: ActionIncludeIcon,
    dataSourceConfigurations,
    setDataSourceConfigurations,
  });

  const pages: MultiPageSheetPage[] = useMemo(
    () => [
      {
        ...dataSourcePage,
        description: "Choose which data sources to include data from",
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
    ],
    [dataSourcePage, timeFrame, description]
  );

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
