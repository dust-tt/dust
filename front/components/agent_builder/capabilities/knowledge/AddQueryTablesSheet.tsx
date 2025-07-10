import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  MultiPageSheet,
  MultiPageSheetContent,
  TableIcon,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { DescriptionSection } from "@app/components/agent_builder/capabilities/knowledge/shared/DescriptionSection";
import {
  getDataSourceConfigurations,
  hasDataSourceSelections,
  isValidPage,
} from "@app/components/agent_builder/capabilities/knowledge/shared/sheetUtils";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import type { DataSourceViewSelectionConfigurations } from "@app/types";

const PAGE_IDS = {
  TABLE_SELECTION: "table-selection",
  CONFIGURATION: "configuration",
} as const;

type PageId = (typeof PAGE_IDS)[keyof typeof PAGE_IDS];

interface AddQueryTablesSheetProps {
  onSave: (action: AgentBuilderAction) => void;
  isOpen: boolean;
  onClose: () => void;
  action?: AgentBuilderAction;
}

export function AddQueryTablesSheet({
  onSave,
  isOpen,
  onClose,
  action,
}: AddQueryTablesSheetProps) {
  const { owner, supportedDataSourceViews } = useAgentBuilderContext();
  const { spaces } = useSpacesContext();
  const [currentPageId, setCurrentPageId] = useState<PageId>(
    PAGE_IDS.TABLE_SELECTION
  );
  const [description, setDescription] = useState(action?.description ?? "");
  const [tableConfigurations, setTableConfigurations] =
    useState<DataSourceViewSelectionConfigurations>(() =>
      getDataSourceConfigurations(action)
    );

  useEffect(() => {
    if (isOpen) {
      setDescription(action?.description ?? "");
      setTableConfigurations(getDataSourceConfigurations(action));
    }
  }, [action, isOpen]);

  const handleClose = () => {
    onClose();
    setDescription("");
    setTableConfigurations({});
    setCurrentPageId(PAGE_IDS.TABLE_SELECTION);
  };

  const hasTables = hasDataSourceSelections(tableConfigurations);

  const handleSave = () => {
    // Note: This creates a placeholder action structure since query tables
    // are now handled through the MCP system in the assistant builder
    const queryTablesAction: AgentBuilderAction = {
      id: action?.id || `query_tables_${Date.now()}`,
      type: "SEARCH", // Using SEARCH as the base type since QUERY_TABLES is now MCP-based
      name: "Query Tables",
      description,
      configuration: {
        type: "SEARCH",
        dataSourceConfigurations: tableConfigurations,
      },
      noConfigurationRequired: false,
    };
    onSave(queryTablesAction);
    handleClose();
  };

  const handlePageChange = (pageId: string) => {
    if (isValidPage(pageId, PAGE_IDS)) {
      setCurrentPageId(pageId);
    }
  };

  const pages: MultiPageSheetPage[] = [
    {
      id: PAGE_IDS.TABLE_SELECTION,
      title: "Select Tables",
      description: "Choose which tables to query from your data sources",
      icon: TableIcon,
      content: (
        <div className="space-y-4">
          <div
            id="tableViewsSelector"
            className="overflow-y-auto scrollbar-hide"
          >
            <DataSourceViewsSpaceSelector
              useCase="assistantBuilder"
              dataSourceViews={supportedDataSourceViews}
              allowedSpaces={spaces}
              owner={owner}
              selectionConfigurations={tableConfigurations}
              setSelectionConfigurations={setTableConfigurations}
              viewType="table"
              isRootSelectable={true}
            />
          </div>
        </div>
      ),
    },
    {
      id: PAGE_IDS.CONFIGURATION,
      title: "Configure Query Tables",
      description: "Describe how you want to query the selected tables",
      icon: TableIcon,
      content: (
        <div className="space-y-6">
          <DescriptionSection
            title="Query Description"
            description="Describe what kind of queries you want to run against your selected tables. The agent will use this context to generate appropriate SQL queries."
            label="Description"
            placeholder="Describe what you want to query from your tables..."
            value={description}
            onChange={setDescription}
            helpText="This description helps the agent understand what kind of SQL queries to generate based on your conversation context."
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
        disableNext={currentPageId === PAGE_IDS.TABLE_SELECTION && !hasTables}
        disableSave={!hasTables || !description.trim()}
      />
    </MultiPageSheet>
  );
}
