import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  MagnifyingGlassIcon,
  MultiPageSheet,
  MultiPageSheetContent,
  TextArea,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderAction,
  SearchAgentBuilderAction,
} from "@app/components/agent_builder/types";
import { isSearchAction } from "@app/components/agent_builder/types";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import logger from "@app/logger/logger";
import type { DataSourceViewSelectionConfigurations } from "@app/types";

const PAGE_IDS = {
  DATA_SOURCE_SELECTION: "data-source-selection",
  DESCRIPTION: "description",
} as const;

type PageId = (typeof PAGE_IDS)[keyof typeof PAGE_IDS];

function isValidPageId(pageId: string): pageId is PageId {
  return Object.values(PAGE_IDS).includes(pageId as PageId);
}

interface AddSearchSheetProps {
  onSave: (action: AgentBuilderAction) => void;
  isOpen: boolean;
  onClose: () => void;
  action?: AgentBuilderAction;
}

const getDataSourceConfigurations = (
  action?: AgentBuilderAction
): DataSourceViewSelectionConfigurations => {
  if (!action || !isSearchAction(action)) {
    return {};
  }
  return action.configuration.dataSourceConfigurations;
};

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
  const [description, setDescription] = useState(action?.description || "");
  const [dataSourceConfigurations, setDataSourceConfigurations] =
    useState<DataSourceViewSelectionConfigurations>(
      getDataSourceConfigurations(action)
    );

  useEffect(() => {
    setDescription(action?.description || "");
    setDataSourceConfigurations(getDataSourceConfigurations(action));
  }, [action]);

  const handleClose = useCallback(() => {
    onClose();
    setDescription("");
    setDataSourceConfigurations({});
    setCurrentPageId(PAGE_IDS.DATA_SOURCE_SELECTION);
  }, [onClose]);

  const hasDataSourceSelections = useMemo(() => {
    return Object.keys(dataSourceConfigurations).length > 0;
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
    if (isValidPageId(pageId)) {
      setCurrentPageId(pageId);
    } else {
      logger.warn({ pageId }, "Invalid page ID received");
    }
  }, []);

  const pages: MultiPageSheetPage[] = useMemo(
    () => [
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
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-lg font-semibold">
                Search Configuration
              </h3>
              <p className="text-sm text-muted-foreground">
                Describe what information you want to search for across your
                selected data sources.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Search Description</label>
              <TextArea
                placeholder="Describe what you want to search for across your selected data sources..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                This description helps the agent understand what type of
                information to search for.
              </p>
            </div>
          </div>
        ),
      },
    ],
    [
      supportedDataSourceViews,
      spaces,
      owner,
      dataSourceConfigurations,
      description,
    ]
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
          currentPageId === PAGE_IDS.DATA_SOURCE_SELECTION &&
          !hasDataSourceSelections
        }
        disableSave={!hasDataSourceSelections || !description.trim()}
      />
    </MultiPageSheet>
  );
}
