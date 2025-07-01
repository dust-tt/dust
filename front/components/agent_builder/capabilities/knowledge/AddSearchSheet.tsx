import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  MagnifyingGlassIcon,
  MultiPageSheet,
  MultiPageSheetContent,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DataSourceSelectionPage } from "@app/components/agent_builder/capabilities/knowledge/shared/DataSourceSelectionPage";
import { DescriptionSection } from "@app/components/agent_builder/capabilities/knowledge/shared/DescriptionSection";
import {
  getDataSourceConfigurations,
  hasDataSourceSelections,
  isValidPage,
} from "@app/components/agent_builder/capabilities/knowledge/shared";
import type {
  AgentBuilderAction,
  SearchAgentBuilderAction,
} from "@app/components/agent_builder/types";
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
  const [currentPageId, setCurrentPageId] = useState<PageId>(
    PAGE_IDS.DATA_SOURCE_SELECTION
  );
  const [description, setDescription] = useState(action?.description ?? "");
  const [dataSourceConfigurations, setDataSourceConfigurations] =
    useState<DataSourceViewSelectionConfigurations>(() =>
      getDataSourceConfigurations(action)
    );

  useEffect(() => {
    setDescription(action?.description ?? "");
    setDataSourceConfigurations(getDataSourceConfigurations(action));
  }, [action]);

  const handleClose = useCallback(() => {
    onClose();
    setDescription("");
    setDataSourceConfigurations({});
    setCurrentPageId(PAGE_IDS.DATA_SOURCE_SELECTION);
  }, [onClose]);

  const hasDataSources = useMemo(() => {
    return hasDataSourceSelections(dataSourceConfigurations);
  }, [dataSourceConfigurations]);

  const handleSave = useCallback(() => {
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
  }, [action?.id, description, dataSourceConfigurations, onSave, handleClose]);

  const handlePageChange = useCallback((pageId: string) => {
    if (isValidPage(pageId, PAGE_IDS)) {
      setCurrentPageId(pageId);
    }
  }, []);

  const dataSourcePage = DataSourceSelectionPage({
    icon: MagnifyingGlassIcon,
    dataSourceConfigurations,
    setDataSourceConfigurations,
  });

  const pages: MultiPageSheetPage[] = useMemo(
    () => [
      {
        ...dataSourcePage,
        description: "Choose which data sources to search across",
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
    ],
    [dataSourcePage, description]
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
