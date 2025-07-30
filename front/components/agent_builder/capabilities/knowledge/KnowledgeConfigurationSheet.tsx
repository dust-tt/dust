import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import { MultiPageSheet, MultiPageSheetContent, ScrollArea } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import type { Control } from "react-hook-form";
import { createFormControl, useFormState, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { DescriptionSection } from "@app/components/agent_builder/capabilities/knowledge/shared/DescriptionSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/knowledge/shared/JsonSchemaSection";
import {
  getDataSourceTree,
  getJsonSchema,
  getTimeFrame,
  isValidPage,
} from "@app/components/agent_builder/capabilities/knowledge/shared/sheetUtils";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/knowledge/shared/TimeFrameSection";
import {
  transformTreeToSelectionConfigurations,
} from "@app/components/agent_builder/capabilities/knowledge/transformations";
import type { CapabilityConfig } from "@app/components/agent_builder/capabilities/knowledge/utils";
import {
  CAPABILITY_CONFIGS,
  generateActionFromFormData,
} from "@app/components/agent_builder/capabilities/knowledge/utils";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import type {
  CapabilityFormData,
  ConfigurationSheetPageId,
  KnowledgeServerName,
} from "@app/components/agent_builder/types";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import { capabilityFormSchema, CONFIGURATION_SHEET_PAGE_IDS } from "@app/components/agent_builder/types";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceBuilderSelector } from "@app/components/data_source_view/DataSourceBuilderSelector";
import type { DataSourceViewSelectionConfigurations } from "@app/types";

interface KnowledgeConfigurationSheetProps {
  capability: KnowledgeServerName | null;
  onSave: (action: AgentBuilderAction) => void;
  isOpen: boolean;
  onClose: () => void;
  action?: AgentBuilderAction;
}

export function KnowledgeConfigurationSheet({
  capability,
  onSave,
  isOpen,
  onClose,
  action,
}: KnowledgeConfigurationSheetProps) {
  // We store as state to control the timing to update the content for exit animation.
  const [config, setConfig] = useState<CapabilityConfig | null>(null);

  const handleClose = () => {
    onClose();

    // TODO: This is a hack and we should find a proper solution.
    // Wait until closing animation ends, otherwise exit animation won't work.
    setTimeout(() => {
      setConfig(null);
    }, 200);
  };

  const handleSave = (
    formData: CapabilityFormData,
    dataSourceConfigurations: DataSourceViewSelectionConfigurations
  ) => {
    if (!config) {
      // never going here
      return;
    }

    const newAction = generateActionFromFormData({
      config,
      formData,
      dataSourceConfigurations,
      actionId: action?.id,
    });

    if (newAction) {
      onSave(newAction);
    }

    handleClose();
  };

  useEffect(() => {
    if (isOpen) {
      setConfig(capability ? CAPABILITY_CONFIGS[capability] : null);
    }
  }, [capability, isOpen]);

  const { control, handleSubmit } = createFormControl<CapabilityFormData>({
    resolver: zodResolver(capabilityFormSchema),
    defaultValues: {
      sources: action
        ? getDataSourceTree(action)
        : {
            in: [],
            notIn: [],
          },
      description: action?.description ?? "",
      timeFrame: getTimeFrame(action),
      jsonSchema: getJsonSchema(action),
    },
  });
  return (
    <MultiPageSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      {config && (
        <KnowledgeConfigurationSheetContent
          config={config}
          onClose={handleClose}
          action={action}
          onSave={handleSave}
          control={control}
          handleSubmit={handleSubmit}
        />
      )}
    </MultiPageSheet>
  );
}

interface KnowledgeConfigurationSheetContentProps {
  config: CapabilityConfig;
  action?: AgentBuilderAction;
  onSave: (
    formData: CapabilityFormData,
    dataSourceConfigurations: DataSourceViewSelectionConfigurations
  ) => void;
  onClose: () => void;
  control: Control<CapabilityFormData>;
  handleSubmit: (
    fn: (data: CapabilityFormData) => void
  ) => (e?: React.BaseSyntheticEvent) => Promise<void>;
}

// This component gets unmounted when config is null so no need to reset the state.
function KnowledgeConfigurationSheetContent({
  action,
  config,
  onSave,
  control,
  handleSubmit,
}: KnowledgeConfigurationSheetContentProps) {
  const { owner } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const { spaces } = useSpacesContext();

  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });

  const [currentPageId, setCurrentPageId] = useState<ConfigurationSheetPageId>(
    CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION
  );

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
          <ScrollArea>
            <DataSourceBuilderSelector
              control={control}
              dataSourceViews={supportedDataSourceViews}
              allowedSpaces={spaces}
              owner={owner}
              viewType="document"
            />
          </ScrollArea>
        </div>
      ),
    },
    {
      id: CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION,
      title: config.configPageTitle,
      description: config.configPageDescription,
      icon: config.icon,
      content: (
        <div className="space-y-6">
          {config.hasTimeFrame && (
            <TimeFrameSection
              control={control}
              actionType={
                config.name === "extract_data" ? "extract" : "include"
              }
            />
          )}
          {config.hasJsonSchema && (
            <JsonSchemaSection
              control={control}
              initialSchemaString={
                action && getJsonSchema(action)
                  ? JSON.stringify(getJsonSchema(action), null, 2)
                  : null
              }
              agentInstructions={instructions}
              owner={owner}
            />
          )}
          <DescriptionSection control={control} {...config.descriptionConfig} />
        </div>
      ),
    },
  ];

  const { isDirty } = useFormState({ control });

  const sources = useWatch({
    control,
    name: "sources",
  });
  const disableNext = useMemo(() => {
    if (currentPageId === CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION) {
      return sources.in.length === 0;
    }
    return false;
  }, [currentPageId, sources.in.length]);

  return (
    <MultiPageSheetContent
      pages={pages}
      currentPageId={currentPageId}
      onPageChange={handlePageChange}
      onSave={handleSubmit((formData) => {
        // Transform the tree structure to selection configurations
        const dataSourceConfigurations = transformTreeToSelectionConfigurations(
          formData.sources,
          supportedDataSourceViews
        );
        onSave(formData, dataSourceConfigurations);
      })}
      size="lg"
      showNavigation
      disableNext={disableNext}
      disableSave={!isDirty}
    />
  );
}
