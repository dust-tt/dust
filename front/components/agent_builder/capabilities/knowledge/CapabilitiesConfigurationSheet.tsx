import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  ActionIncludeIcon,
  ActionScanIcon,
  MagnifyingGlassIcon,
  MultiPageSheet,
  MultiPageSheetContent,
  TableIcon,
} from "@dust-tt/sparkle";
import { AnimatePresence } from "framer-motion";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { useEffect, useState } from "react";
import { useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { FormProvider } from "@app/components/sparkle/FormProvider";
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
  IncludeDataAgentBuilderAction,
  KnowledgeServerName,
  SearchAgentBuilderAction,
} from "@app/components/agent_builder/types";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  TimeFrame,
} from "@app/types";

const DESCRIPTION_MAX_LENGTH = 800;

const capabilityFormSchema = z.object({
  description: z
    .string()
    .min(1, "Description is required")
    .max(DESCRIPTION_MAX_LENGTH, "Description too long"),
  dataSourceConfigurations: z.record(z.any()).default({}),
  timeFrame: z
    .object({
      duration: z.number().nullable(),
      unit: z.enum(["hour", "day", "week", "month", "year"]).nullable(),
    })
    .nullable()
    .default(null),
  jsonSchema: z.any().nullable().default(null),
});

type CapabilityFormData = z.infer<typeof capabilityFormSchema>;

const PAGE_IDS = {
  DATA_SOURCE_SELECTION: "data-source-selection",
  CONFIGURATION: "configuration",
} as const;

type PageId = (typeof PAGE_IDS)[keyof typeof PAGE_IDS];

interface CapabilityConfig {
  title: string;
  description: string;
  icon: React.ComponentType;
  viewType: DataSourceViewType;
  actionType: AgentBuilderAction["type"];
  actionName: string;
  configPageTitle: string;
  configPageDescription: string;
  hasTimeFrame: boolean;
  hasJsonSchema: boolean;
  descriptionConfig: {
    title: string;
    description: string;
    placeholder: string;
    helpText?: string;
    maxLength?: number;
  };
}

const CAPABILITY_CONFIGS: Record<KnowledgeServerName, CapabilityConfig> = {
  search: {
    title: "Select Data Sources",
    description: "Choose which data sources to search",
    icon: MagnifyingGlassIcon,
    viewType: "document",
    actionType: "SEARCH",
    actionName: "Search",
    configPageTitle: "Configure Search",
    configPageDescription: "Describe what you want to search for",
    hasTimeFrame: false,
    hasJsonSchema: false,
    descriptionConfig: {
      title: "Search Description",
      description:
        "Describe what you want to search for in your selected data sources.",
      placeholder: "Describe what you want to search for...",
      helpText:
        "This description helps the agent understand what to search for.",
    },
  },
  include_data: {
    title: "Select Data Sources",
    description: "Choose which data sources to include data from",
    icon: ActionIncludeIcon,
    viewType: "document",
    actionType: "INCLUDE_DATA",
    actionName: "Include Data",
    configPageTitle: "Configure Include Data",
    configPageDescription: "Set time range and describe what data to include",
    hasTimeFrame: true,
    hasJsonSchema: false,
    descriptionConfig: {
      title: "Data Description",
      description:
        "Describe what type of data you want to include from your selected data sources to provide context to the agent.",
      placeholder:
        "Describe what data you want to include from your selected data sources...",
      helpText:
        "This description helps the agent understand what type of data to include as context.",
    },
  },
  extract_data: {
    title: "Data Sources",
    description: "Choose which data sources to extract data from",
    icon: ActionScanIcon,
    viewType: "document",
    actionType: "EXTRACT_DATA",
    actionName: "Extract Data",
    configPageTitle: "Configure Extract Data",
    configPageDescription:
      "Set extraction parameters and describe what data to extract",
    hasTimeFrame: true,
    hasJsonSchema: true,
    descriptionConfig: {
      title: "What's the data?",
      description:
        "Provide a brief description (maximum 800 characters) of the data content and context to help the agent determine when to utilize it effectively.",
      placeholder: "This data contains…",
      maxLength: DESCRIPTION_MAX_LENGTH,
    },
  },
  query_tables: {
    title: "Select Tables",
    description: "Choose which tables to query from your data sources",
    icon: TableIcon,
    viewType: "table",
    actionType: "SEARCH",
    actionName: "Query Tables",
    configPageTitle: "Configure Query Tables",
    configPageDescription: "Describe how you want to query the selected tables",
    hasTimeFrame: false,
    hasJsonSchema: false,
    descriptionConfig: {
      title: "Query Description",
      description:
        "Describe what kind of queries you want to run against your selected tables. The agent will use this context to generate appropriate SQL queries.",
      placeholder: "Describe what you want to query from your tables...",
      helpText:
        "This description helps the agent understand what kind of SQL queries to generate based on your conversation context.",
    },
  },
};

interface CapabilitiesConfigurationSheetProps {
  capability: KnowledgeServerName | null;
  onSave: (action: AgentBuilderAction) => void;
  isOpen: boolean;
  onClose: () => void;
  action?: AgentBuilderAction;
}

export function CapabilitiesConfigurationSheet({
  capability,
  onSave,
  isOpen,
  onClose,
  action,
}: CapabilitiesConfigurationSheetProps) {
  const { owner, supportedDataSourceViews } = useAgentBuilderContext();
  const { spaces } = useSpacesContext();
  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });

  const [currentPageId, setCurrentPageId] = useState<PageId>(
    PAGE_IDS.DATA_SOURCE_SELECTION
  );

  const form = useForm<CapabilityFormData>({
    resolver: zodResolver(capabilityFormSchema),
    defaultValues: {
      description: action?.description ?? "",
      dataSourceConfigurations: getDataSourceConfigurations(action),
      timeFrame: getTimeFrame(action),
      jsonSchema: getJsonSchema(action),
    },
  });

  const { watch, setValue, getValues } = form;
  const [description, dataSourceConfigurations, timeFrame, jsonSchema] = watch([
    "description",
    "dataSourceConfigurations",
    "timeFrame",
    "jsonSchema",
  ]);

  useEffect(() => {
    if (isOpen) {
      form.reset({
        description: action?.description ?? "",
        dataSourceConfigurations: getDataSourceConfigurations(action),
        timeFrame: getTimeFrame(action),
        jsonSchema: getJsonSchema(action),
      });
    }
  }, [action, isOpen, form]);

  const handleClose = () => {
    onClose();
    form.reset({
      description: "",
      dataSourceConfigurations: {},
      timeFrame: null,
      jsonSchema: null,
    });
    setCurrentPageId(PAGE_IDS.DATA_SOURCE_SELECTION);
  };

  const hasDataSources = hasDataSourceSelections(dataSourceConfigurations);

  const handleSave = () => {
    if (!capability) return;

    const formData = getValues();
    const config = CAPABILITY_CONFIGS[capability];
    let newAction: AgentBuilderAction;

    switch (config.actionType) {
      case "SEARCH":
        newAction = {
          id: action?.id || `${capability}_${Date.now()}`,
          type: "SEARCH",
          name: config.actionName,
          description: formData.description,
          configuration: {
            type: "SEARCH",
            dataSourceConfigurations: formData.dataSourceConfigurations,
          },
          noConfigurationRequired: false,
        } as SearchAgentBuilderAction;
        break;
      case "INCLUDE_DATA":
        newAction = {
          id: action?.id || `include_data_${Date.now()}`,
          type: "INCLUDE_DATA",
          name: config.actionName,
          description: formData.description,
          configuration: {
            type: "INCLUDE_DATA",
            dataSourceConfigurations: formData.dataSourceConfigurations,
            timeFrame: formData.timeFrame,
          },
          noConfigurationRequired: false,
        } as IncludeDataAgentBuilderAction;
        break;
      case "EXTRACT_DATA":
        newAction = {
          id: action?.id || `extract_data_${Date.now()}`,
          type: "EXTRACT_DATA",
          name: config.actionName,
          description: formData.description,
          configuration: {
            type: "EXTRACT_DATA",
            dataSourceConfigurations: formData.dataSourceConfigurations,
            timeFrame: formData.timeFrame,
            jsonSchema: formData.jsonSchema,
          },
          noConfigurationRequired: false,
        } as ExtractDataAgentBuilderAction;
        break;
      default:
        return;
    }

    onSave(newAction);
    handleClose();
  };

  const handlePageChange = (pageId: string) => {
    if (isValidPage(pageId, PAGE_IDS)) {
      setCurrentPageId(pageId);
    }
  };

  const config = capability ? CAPABILITY_CONFIGS[capability] : null;

  const pages: MultiPageSheetPage[] = config
    ? [
        {
          id: PAGE_IDS.DATA_SOURCE_SELECTION,
          title: config.title,
          description: config.description,
          icon: config.icon,
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
                  setSelectionConfigurations={(configs) =>
                    setValue("dataSourceConfigurations", configs)
                  }
                  viewType={config.viewType}
                  isRootSelectable={true}
                />
              </div>
            </div>
          ),
        },
        {
          id: PAGE_IDS.CONFIGURATION,
          title: config.configPageTitle,
          description: config.configPageDescription,
          icon: config.icon,
          content: (
            <div className="space-y-6">
              {config.hasTimeFrame && (
                <TimeFrameSection
                  timeFrame={timeFrame}
                  setTimeFrame={(timeFrame) => setValue("timeFrame", timeFrame)}
                  actionType={
                    capability === "extract_data" ? "extract" : "include"
                  }
                />
              )}
              {config.hasJsonSchema && (
                <JsonSchemaSection
                  title="Schema"
                  description="Optionally, provide a schema for the data to be extracted. If you do not specify a schema, the tool will determine the schema based on the conversation context."
                  value={jsonSchema}
                  initialSchemaString={
                    action && getJsonSchema(action)
                      ? JSON.stringify(getJsonSchema(action), null, 2)
                      : null
                  }
                  onChange={(schema) => setValue("jsonSchema", schema)}
                  agentInstructions={instructions}
                  agentDescription={description}
                  owner={owner}
                />
              )}
              <DescriptionSection
                title={config.descriptionConfig.title}
                description={config.descriptionConfig.description}
                placeholder={config.descriptionConfig.placeholder}
                value={description}
                onChange={(desc) => setValue("description", desc)}
                maxLength={config.descriptionConfig.maxLength}
                helpText={config.descriptionConfig.helpText}
              />
            </div>
          ),
        },
      ]
    : [];

  const isDescriptionValid =
    config &&
    (config.descriptionConfig.maxLength
      ? description.trim() &&
        description.length <= config.descriptionConfig.maxLength
      : description.trim());

  return (
    <MultiPageSheet
      key={capability}
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
        disableSave={!hasDataSources || !isDescriptionValid}
      />
    </MultiPageSheet>
  );
}
