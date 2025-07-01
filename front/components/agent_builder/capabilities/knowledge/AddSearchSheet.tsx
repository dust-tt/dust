import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  MagnifyingGlassIcon,
  MultiPageSheet,
  MultiPageSheetContent,
  TextArea,
} from "@dust-tt/sparkle";
import type { SetStateAction } from "react";
import { useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
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
  onKnowledgeAdd: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function AddSearchSheet({
  onKnowledgeAdd,
  isOpen,
  onClose,
}: AddSearchSheetProps) {
  const { owner, supportedDataSourceViews } = useAgentBuilderContext();
  const { spaces } = useSpacesContext();
  const [currentPageId, setCurrentPageId] = useState<PageId>(
    PAGE_IDS.DATA_SOURCE_SELECTION
  );
  const [description, setDescription] = useState<string>("");
  const [dataSourceConfigurations, setDataSourceConfigurations] =
    useState<DataSourceViewSelectionConfigurations>({});

  const resetForm = () => {
    setCurrentPageId(PAGE_IDS.DATA_SOURCE_SELECTION);
    setDescription("");
    setDataSourceConfigurations({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const setSelectionConfigurationsCallback = (
    func: SetStateAction<DataSourceViewSelectionConfigurations>
  ) => {
    setDataSourceConfigurations(func);
  };

  const hasDataSourceSelections =
    Object.keys(dataSourceConfigurations).length > 0;

  const handleSave = () => {
    if (hasDataSourceSelections && description.trim()) {
      resetForm();
      onKnowledgeAdd();
    }
  };

  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setDescription(e.target.value);
  };

  const handlePageChange = (pageId: string) => {
    if (isValidPageId(pageId)) {
      setCurrentPageId(pageId);
    } else {
      logger.warn({ pageId }, "Invalid page ID received");
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
              setSelectionConfigurations={setSelectionConfigurationsCallback}
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
            <h3 className="mb-2 text-lg font-semibold">Search Configuration</h3>
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
              onChange={handleDescriptionChange}
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
          currentPageId === PAGE_IDS.DATA_SOURCE_SELECTION &&
          !hasDataSourceSelections
        }
        disableSave={!hasDataSourceSelections || !description.trim()}
      />
    </MultiPageSheet>
  );
}
