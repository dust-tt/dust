import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
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
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
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

const FORM_ID = "capabilities-form";

const endButtonProps = {
  type: "submit",
  form: FORM_ID,
};

export function CapabilitiesConfigurationSheet({
  capability,
  onSave,
  isOpen,
  onClose,
  action,
}: CapabilitiesConfigurationSheetProps) {
  // We store as state to control the timing to update the content for exit animation.
  const [config, setConfig] = useState<CapabilityConfig | null>(null);
  // We don't want to close the dialog when there is a form error when it's submitted, but we want to let it close
  // after even if there is an error. The only solution I can think of is manually set this on submit, and reset it
  // inside the onOpenChange so that users can close it after they've seen it once.
  const preventSheetCloseRef = useRef(false);

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
        if (!open && !preventSheetCloseRef.current) {
          handleClose();
        }
        preventSheetCloseRef.current = false;
      }}
    >
      {config && (
        <CapabilitiesConfigurationSheetContent
          config={config}
          onClose={handleClose}
          action={action}
          onSave={onSave}
          preventSheetCloseRef={preventSheetCloseRef}
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
  preventSheetCloseRef: any;
}

// This component gets unmounted when config is null so no need to reset the state.
function CapabilitiesConfigurationSheetContent({
  action,
  onSave,
  config,
  onClose,
  preventSheetCloseRef,
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

  const hasDataSources = hasDataSourceSelections(dataSourceConfigurations);

  const handleSave = (formData: CapabilityFormData) => {
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
        };
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
        };
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
        };
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
        <FormProvider form={form} onSubmit={handleSave} formId={FORM_ID}>
          <div className="space-y-6">
            {config.hasTimeFrame && (
              <TimeFrameSection
                actionType={
                  config.name === "extract_data" ? "extract" : "include"
                }
              />
            )}
            {config.hasJsonSchema && (
              <JsonSchemaSection
                initialSchemaString={
                  action && getJsonSchema(action)
                    ? JSON.stringify(getJsonSchema(action), null, 2)
                    : null
                }
                agentInstructions={instructions}
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
      onSave={() => {
        preventSheetCloseRef.current = true;
      }}
      size="lg"
      showNavigation={true}
      disableNext={
        currentPageId === CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION &&
        !hasDataSources
      }
      disableSave={!hasDataSources}
      endButtonProps={endButtonProps}
    />
  );
}
