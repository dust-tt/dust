import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

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
import type { CapabilityConfig } from "@app/components/agent_builder/capabilities/knowledge/utils";
import { CAPABILITY_CONFIGS } from "@app/components/agent_builder/capabilities/knowledge/utils";
import type {
  CapabilityFormData,
  ConfigurationSheetPageId,
  KnowledgeServerName,
} from "@app/components/agent_builder/types";
import type {
  AgentBuilderAction,
  ExtractDataAgentBuilderAction,
  IncludeDataAgentBuilderAction,
  SearchAgentBuilderAction,
} from "@app/components/agent_builder/types";
import {
  capabilityFormSchema,
  CONFIGURATION_SHEET_PAGE_IDS,
} from "@app/components/agent_builder/types";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import type { DataSourceViewSelectionConfigurations } from "@app/types";

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
  // We store as state to to control the timing to update the content for exit animation.
  const [config, setConfig] = useState<CapabilityConfig | null>(null);

  const handleClose = () => {
    onClose();

    // Wait until closing animation ends, otherwise exit animation won't work.
    setTimeout(() => {
      setConfig(null);
    }, 200);
  };

  useEffect(() => {
    if (isOpen) {
      setConfig(capability ? CAPABILITY_CONFIGS[capability] : null);
    }
  }, [capability, isOpen]);

  return (
    <MultiPageSheet
      open={isOpen}
      onOpenChange={(open) => {
        !open && handleClose();
      }}
    >
      {config && (
        <CapabilitiesConfigurationSheetContent
          config={config}
          onClose={handleClose}
          action={action}
          onSave={onSave}
        />
      )}
    </MultiPageSheet>
  );
}

interface CapabilitiesConfigurationSheetContent {
  config: CapabilityConfig;
  action?: AgentBuilderAction;
  onSave: (action: AgentBuilderAction) => void;
  onClose: () => void;
}

// This component gets unmounted when config is null so no need to reset the state.
function CapabilitiesConfigurationSheetContent({
  action,
  onSave,
  config,
  onClose,
}: CapabilitiesConfigurationSheetContent) {
  const { owner, supportedDataSourceViews } = useAgentBuilderContext();
  const { spaces } = useSpacesContext();
  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });

  const [currentPageId, setCurrentPageId] = useState<ConfigurationSheetPageId>(
    CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION
  );
  const [dataSourceConfigurations, setDataSourceConfigurations] =
    useState<DataSourceViewSelectionConfigurations>(() =>
      getDataSourceConfigurations(action)
    );

  const form = useForm<CapabilityFormData>({
    resolver: zodResolver(capabilityFormSchema),
    defaultValues: {
      description: action?.description ?? "",
      timeFrame: getTimeFrame(action),
      jsonSchema: getJsonSchema(action),
    },
  });

  const { watch, setValue, getValues, formState } = form;
  const [description, timeFrame, jsonSchema] = watch([
    "description",
    "timeFrame",
    "jsonSchema",
  ]);

  const hasDataSources = hasDataSourceSelections(dataSourceConfigurations);

  const handleSave = () => {
    const formData = getValues();
    let newAction: AgentBuilderAction;

    switch (config.actionType) {
      case "SEARCH":
        newAction = {
          id: action?.id || `${config.name}_${Date.now()}`,
          type: "SEARCH",
          name: config.actionName,
          description: formData.description,
          configuration: {
            type: "SEARCH",
            dataSourceConfigurations,
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
            dataSourceConfigurations,
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
            dataSourceConfigurations,
            timeFrame: formData.timeFrame,
            jsonSchema: formData.jsonSchema,
          },
          noConfigurationRequired: false,
        } as ExtractDataAgentBuilderAction;
        break;
      default:
        return;
    }

    onClose();
    onSave(newAction);
  };

  const handlePageChange = (pageId: string) => {
    if (isValidPage(pageId, CONFIGURATION_SHEET_PAGE_IDS)) {
      setCurrentPageId(pageId);
    }
  };

  const pages: MultiPageSheetPage[] = [
    {
      id: CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION,
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
              setSelectionConfigurations={setDataSourceConfigurations}
              viewType={config.viewType}
              isRootSelectable={true}
            />
          </div>
        </div>
      ),
    },
    {
      id: CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION,
      title: config.configPageTitle,
      description: config.configPageDescription,
      icon: config.icon,
      content: (
        <FormProvider form={form}>
          <div className="space-y-6">
            {config.hasTimeFrame && (
              <TimeFrameSection
                timeFrame={timeFrame}
                setTimeFrame={(timeFrame) => setValue("timeFrame", timeFrame)}
                actionType={
                  config.name === "extract_data" ? "extract" : "include"
                }
              />
            )}
            {config.hasJsonSchema && (
              <JsonSchemaSection
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
            <DescriptionSection {...config.descriptionConfig} />
          </div>
        </FormProvider>
      ),
    },
  ];

  return (
    <MultiPageSheetContent
      pages={pages}
      currentPageId={currentPageId}
      onPageChange={handlePageChange}
      size="lg"
      onSave={handleSave}
      showNavigation={true}
      disableNext={
        currentPageId === CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION &&
        !hasDataSources
      }
      disableSave={!hasDataSources || !formState.isValid}
    />
  );
}
