import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  MagnifyingGlassIcon,
  MultiPageSheet,
  MultiPageSheetContent,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { DescriptionSection } from "@app/components/agent_builder/capabilities/knowledge/shared/DescriptionSection";
import {
  getDataSourceConfigurations,
  hasDataSourceSelections,
  isValidPage,
} from "@app/components/agent_builder/capabilities/knowledge/shared/sheetUtils";
import type {
  AgentBuilderAction,
  SearchAgentBuilderAction,
} from "@app/components/agent_builder/types";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import type { DataSourceViewSelectionConfigurations } from "@app/types";

const PAGE_IDS = {
  DATA_SOURCE_SELECTION: "data-source-selection",
  DESCRIPTION: "description",
} as const;

type PageId = (typeof PAGE_IDS)[keyof typeof PAGE_IDS];

interface AddSearchSheetProps {
  onSave: (action: AgentBuilderAction) => void;
  isOpen: boolean;
  onClose: () => void;
  action?: AgentBuilderAction;
}

export function AddSearchSheet({
  onSave,
  isOpen,
  onClose,
  action,
}: AddSearchSheetProps) {
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

  useEffect(() => {
    if (isOpen) {
      setDescription(action?.description ?? "");
      setDataSourceConfigurations(getDataSourceConfigurations(action));
    }
  }, [action, isOpen]);

  const handleClose = () => {
    onClose();
    setDescription("");
    setDataSourceConfigurations({});
    setCurrentPageId(PAGE_IDS.DATA_SOURCE_SELECTION);
  };

  const hasDataSources = hasDataSourceSelections(dataSourceConfigurations);

  const handleSave = () => {
    const searchAction: SearchAgentBuilderAction = {
      id: action?.id || `search_${Date.now()}`,
      type: "SEARCH",
      name: "Search",
      description,
      configuration: {
        type: "SEARCH",
        dataSourceConfigurations,
      },
      noConfigurationRequired: false,
    };
    onSave(searchAction);
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
      description: "Choose which data sources to search across",
      icon: MagnifyingGlassIcon,
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
      id: PAGE_IDS.DESCRIPTION,
      title: "Add Description",
      description: "Describe what you want to search for",
      icon: MagnifyingGlassIcon,
      content: (
        <DescriptionSection
          title="Search Configuration"
          description="Describe what information you want to search for across your selected data sources."
          label="Search Description"
          placeholder="Describe what you want to search for across your selected data sources..."
          value={description}
          onChange={setDescription}
          helpText="This description helps the agent understand what type of information to search for."
        />
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
