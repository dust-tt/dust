import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  MultiPageSheet,
  MultiPageSheetContent,
  MultiPageSheetTrigger,
  ScrollArea,
} from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import type { Control } from "react-hook-form";
import { createFormControl, useWatch } from "react-hook-form";

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
import { transformTreeToSelectionConfigurations } from "@app/components/agent_builder/capabilities/knowledge/transformations";
import type { CapabilityConfig } from "@app/components/agent_builder/capabilities/knowledge/utils";
import {
  CAPABILITY_CONFIGS,
  generateActionFromFormData,
} from "@app/components/agent_builder/capabilities/knowledge/utils";
import { MCPServerViewsKnowledgeDropdown } from "@app/components/agent_builder/capabilities/MCPServerViewsKnowledgeDropdown";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type {
  CapabilityFormData,
  ConfigurationSheetPageId,
  KnowledgeServerName,
} from "@app/components/agent_builder/types";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import {
  ACTION_TYPE_TO_MCP_SERVER_MAP,
  capabilityFormSchema,
  CONFIGURATION_SHEET_PAGE_IDS,
  isKnowledgeServerName,
  isSupportedAgentBuilderAction,
} from "@app/components/agent_builder/types";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceBuilderSelector } from "@app/components/data_source_view/DataSourceBuilderSelector";
import type { DataSourceViewSelectionConfigurations } from "@app/types";

interface KnowledgeConfigurationSheetProps {
  capability?: KnowledgeServerName | null;
  onSave: (action: AgentBuilderAction) => void;
  onClose: () => void;
  onOpen?: () => void;
  action?: AgentBuilderAction;
  open: boolean;
}

export function KnowledgeConfigurationSheet({
  capability,
  onSave,
  onClose,
  onOpen,
  action,
  open,
}: KnowledgeConfigurationSheetProps) {
  const [config, setConfig] = useState<CapabilityConfig | null>(() => {
    if (capability) {
      return CAPABILITY_CONFIGS[capability];
    }
    if (action && isSupportedAgentBuilderAction(action)) {
      const serverName = ACTION_TYPE_TO_MCP_SERVER_MAP[action.type];
      return serverName && isKnowledgeServerName(serverName)
        ? CAPABILITY_CONFIGS[serverName]
        : null;
    }
    return CAPABILITY_CONFIGS["search"];
  });

  const handleClose = () => {
    onClose();
  };

  const handleSave = (
    formData: CapabilityFormData,
    dataSourceConfigurations: DataSourceViewSelectionConfigurations,
    configToUse: CapabilityConfig
  ) => {
    const newAction = generateActionFromFormData({
      config: configToUse,
      formData,
      dataSourceConfigurations,
      actionId: action?.id,
    });

    if (newAction) {
      onSave(newAction);
      handleClose();
    }
  };

  const { control, handleSubmit } = useMemo(() => {
    const dataSourceTree = action
      ? getDataSourceTree(action)
      : {
          in: [],
          notIn: [],
        };

    return createFormControl<CapabilityFormData>({
      resolver: zodResolver(capabilityFormSchema),
      defaultValues: {
        sources: dataSourceTree,
        description: action?.description ?? "",
        timeFrame: getTimeFrame(action),
        jsonSchema: getJsonSchema(action),
      },
    });
  }, [action]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleClose();
    }
  };

  const handleTriggerClick = () => {
    if (!open && onOpen) {
      onOpen();
    }
  };

  return (
    <MultiPageSheet open={open} onOpenChange={handleOpenChange}>
      <MultiPageSheetTrigger asChild>
        <Button label="Add knowledge" onClick={handleTriggerClick} />
      </MultiPageSheetTrigger>
      <KnowledgeConfigurationSheetContent
        config={config}
        setConfig={setConfig}
        action={action}
        onSave={handleSave}
        control={control}
        handleSubmit={handleSubmit}
        isOpen={open}
      />
    </MultiPageSheet>
  );
}

interface KnowledgeConfigurationSheetContentProps {
  config: CapabilityConfig | null;
  setConfig: (config: CapabilityConfig | null) => void;
  action?: AgentBuilderAction;
  onSave: (
    formData: CapabilityFormData,
    dataSourceConfigurations: DataSourceViewSelectionConfigurations,
    configToUse: CapabilityConfig
  ) => void;
  control: Control<CapabilityFormData>;
  handleSubmit: (
    fn: (data: CapabilityFormData) => void
  ) => (e?: React.BaseSyntheticEvent) => Promise<void>;
  isOpen: boolean;
}

function KnowledgeConfigurationSheetContent({
  action,
  config,
  setConfig,
  onSave,
  control,
  handleSubmit,
  isOpen,
}: KnowledgeConfigurationSheetContentProps) {
  const { owner } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const { spaces } = useSpacesContext();
  const { mcpServerViewsWithKnowledge, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });

  const initialPageId =
    action && isSupportedAgentBuilderAction(action)
      ? CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION
      : CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION;

  const [currentPageId, setCurrentPageId] =
    useState<ConfigurationSheetPageId>(initialPageId);

  useEffect(() => {
    if (action) {
      if (isSupportedAgentBuilderAction(action)) {
        setCurrentPageId(CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION);
        const serverName = ACTION_TYPE_TO_MCP_SERVER_MAP[action.type];
        setSelectedMCPServerName(serverName);
        if (serverName && isKnowledgeServerName(serverName)) {
          setConfig(CAPABILITY_CONFIGS[serverName]);
        }
      }
    }
  }, [action, setConfig]);

  useEffect(() => {
    if (!isOpen && !action) {
      setCurrentPageId(CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION);
      setSelectedMCPServerName("search");
      setConfig(CAPABILITY_CONFIGS["search"]);
    }
  }, [isOpen, action, setConfig]);

  const [selectedMCPServerName, setSelectedMCPServerName] = useState<
    string | null
  >(
    action && isSupportedAgentBuilderAction(action)
      ? ACTION_TYPE_TO_MCP_SERVER_MAP[action.type]
      : "search"
  );

  const handlePageChange = (pageId: string) => {
    if (isValidPage(pageId, CONFIGURATION_SHEET_PAGE_IDS)) {
      setCurrentPageId(pageId);
    }
  };

  const handleMCPServerSelection = (serverName: string) => {
    setSelectedMCPServerName(serverName);
    if (isKnowledgeServerName(serverName)) {
      setConfig(CAPABILITY_CONFIGS[serverName]);
    }
  };

  const pages: MultiPageSheetPage[] = [
    {
      id: CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION,
      title: "Select Data Sources",
      description: "Choose the data sources to include in your knowledge base",
      icon: undefined,
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
      title: config?.configPageTitle || "Configure Knowledge",
      description:
        config?.configPageDescription ||
        "Select knowledge type and configure settings",
      icon: config?.icon,
      content: (
        <div className="space-y-6">
          {/* MCP Server View Selection Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              Choose your processing method
            </h3>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Smart data access through search, extraction, and queries.
            </span>
            <div className="flex flex-col items-start">
              <MCPServerViewsKnowledgeDropdown
                mcpServerViewsWithKnowledge={mcpServerViewsWithKnowledge}
                onItemClick={handleMCPServerSelection}
                isMCPServerViewsLoading={isMCPServerViewsLoading}
                selectedServerName={selectedMCPServerName}
              />
            </div>
          </div>

          {/* Configuration Section - Only show when MCP server is selected */}
          {selectedMCPServerName && config && (
            <>
              <hr className="border-gray-200" />
              <div className="space-y-6">
                <h3 className="text-lg font-semibold">Configuration</h3>
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
                <DescriptionSection
                  control={control}
                  {...config.descriptionConfig}
                />
              </div>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <MultiPageSheetContent
      pages={pages}
      currentPageId={currentPageId}
      onPageChange={handlePageChange}
      onSave={handleSubmit((formData) => {
        if (!config) {
          return;
        }
        // Transform the tree structure to selection configurations
        const dataSourceConfigurations = transformTreeToSelectionConfigurations(
          formData.sources,
          supportedDataSourceViews
        );
        onSave(formData, dataSourceConfigurations, config);
      })}
      size="xl"
      showNavigation
    />
  );
}
