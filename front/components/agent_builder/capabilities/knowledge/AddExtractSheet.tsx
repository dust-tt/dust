import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  ActionScanIcon,
  MultiPageSheet,
  MultiPageSheetContent,
} from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { DataSourceSelectionPage } from "@app/components/agent_builder/capabilities/knowledge/shared/DataSourceSelectionPage";
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
import type {
  DataSourceViewSelectionConfigurations,
  TimeFrame,
} from "@app/types";

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
  const { owner } = useAgentBuilderContext();
  const form = useFormContext<AgentBuilderFormData>();
  const formValues = form.watch();
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

  const handleClose = useCallback(() => {
    onClose();
    setDescription("");
    setDataSourceConfigurations({});
    setTimeFrame(null);
    setJsonSchema(null);
    setCurrentPageId(PAGE_IDS.DATA_SOURCE_SELECTION);
  }, [onClose]);

  const hasDataSources = useMemo(() => {
    return hasDataSourceSelections(dataSourceConfigurations);
  }, [dataSourceConfigurations]);

  const handleSave = useCallback(() => {
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
  }, [
    action?.id,
    description,
    dataSourceConfigurations,
    timeFrame,
    jsonSchema,
    onSave,
    handleClose,
  ]);

  const handlePageChange = useCallback((pageId: string) => {
    if (isValidPage(pageId, PAGE_IDS)) {
      setCurrentPageId(pageId);
    }
  }, []);

  const dataSourcePage = DataSourceSelectionPage({
    icon: ActionScanIcon,
    dataSourceConfigurations,
    setDataSourceConfigurations,
  });

  const pages: MultiPageSheetPage[] = useMemo(
    () => [
      {
        ...dataSourcePage,
        description: "Choose which data sources to extract data from",
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
              agentInstructions={formValues.instructions}
              agentDescription={description}
              owner={owner}
            />
            <DescriptionSection
              title="What's the data?"
              description="Provide a brief description (maximum 800 characters) of the data content and context to help the agent determine when to utilize it effectively."
              placeholder="This data contains…"
              value={description}
              onChange={setDescription}
              maxLength={800}
            />
          </div>
        ),
      },
    ],
    [
      dataSourcePage,
      timeFrame,
      jsonSchema,
      description,
      formValues.instructions,
      action,
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
          currentPageId === PAGE_IDS.DATA_SOURCE_SELECTION && !hasDataSources
        }
        disableSave={
          !hasDataSources || !description.trim() || description.length > 800
        }
      />
    </MultiPageSheet>
  );
}
