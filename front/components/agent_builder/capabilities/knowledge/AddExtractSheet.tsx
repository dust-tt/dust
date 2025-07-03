import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  ActionScanIcon,
  MultiPageSheet,
  MultiPageSheetContent,
} from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { useEffect, useState } from "react";
import { useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { DescriptionSection } from "@app/components/agent_builder/capabilities/knowledge/shared/DescriptionSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/knowledge/shared/JsonSchemaSection";
import {
  getDataSourceConfigurations,
  getJsonSchema,
  getTimeFrame,
  hasDataSourceSelections,
  isValidPage,
} from "@app/components/agent_builder/capabilities/knowledge/shared/sheetUtils";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/knowledge/shared/TimeFrameSection";
import type {
  AgentBuilderAction,
  ExtractDataAgentBuilderAction,
} from "@app/components/agent_builder/types";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import type {
  DataSourceViewSelectionConfigurations,
  TimeFrame,
} from "@app/types";

const DESCRIPTION_MAX_LENGTH = 800;

const PAGE_IDS = {
  DATA_SOURCE_SELECTION: "data-source-selection",
  CONFIGURATION: "configuration",
} as const;

type PageId = (typeof PAGE_IDS)[keyof typeof PAGE_IDS];

interface AddExtractSheetProps {
  onSave: (action: AgentBuilderAction) => void;
  isOpen: boolean;
  onClose: () => void;
  action?: AgentBuilderAction;
}

export function AddExtractSheet({
  onSave,
  isOpen,
  onClose,
  action,
}: AddExtractSheetProps) {
  const { owner, supportedDataSourceViews } = useAgentBuilderContext();
  const { spaces } = useSpacesContext();
  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });
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
  const [jsonSchema, setJsonSchema] = useState<JSONSchema | null>(() =>
    getJsonSchema(action)
  );

  useEffect(() => {
    setDescription(action?.description ?? "");
    setDataSourceConfigurations(getDataSourceConfigurations(action));
    setTimeFrame(getTimeFrame(action));
    setJsonSchema(getJsonSchema(action));
  }, [action]);

  const handleClose = () => {
    onClose();
    setDescription("");
    setDataSourceConfigurations({});
    setTimeFrame(null);
    setJsonSchema(null);
    setCurrentPageId(PAGE_IDS.DATA_SOURCE_SELECTION);
  };

  const hasDataSources = hasDataSourceSelections(dataSourceConfigurations);

  const handleSave = () => {
    const extractDataAction: ExtractDataAgentBuilderAction = {
      id: action?.id || `extract_data_${Date.now()}`,
      type: "EXTRACT_DATA",
      name: "Extract Data",
      description,
      configuration: {
        type: "EXTRACT_DATA",
        dataSourceConfigurations,
        timeFrame,
        jsonSchema,
      },
      noConfigurationRequired: false,
    };
    onSave(extractDataAction);
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
      title: "Data Sources",
      description: "Choose which data sources to extract data from",
      icon: ActionScanIcon,
      content: (
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
      ),
    },
    {
      id: PAGE_IDS.CONFIGURATION,
      title: "Configure Extract Data",
      description:
        "Set extraction parameters and describe what data to extract",
      icon: ActionScanIcon,
      content: (
        <div className="space-y-6">
          <TimeFrameSection
            timeFrame={timeFrame}
            setTimeFrame={setTimeFrame}
            actionType="extract"
          />
          <JsonSchemaSection
            title="Schema"
            description="Optionally, provide a schema for the data to be extracted. If you do not specify a schema, the tool will determine the schema based on the conversation context."
            value={jsonSchema}
            initialSchemaString={
              action && getJsonSchema(action)
                ? JSON.stringify(getJsonSchema(action), null, 2)
                : null
            }
            onChange={setJsonSchema}
            agentInstructions={instructions}
            agentDescription={description}
            owner={owner}
          />
          <DescriptionSection
            title="What's the data?"
            description="Provide a brief description (maximum 800 characters) of the data content and context to help the agent determine when to utilize it effectively."
            placeholder="This data contains…"
            value={description}
            onChange={setDescription}
            maxLength={DESCRIPTION_MAX_LENGTH}
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
        disableSave={
          !hasDataSources || !description.trim() || description.length > 800
        }
      />
    </MultiPageSheet>
  );
}
