import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  BookOpenIcon,
  ContextItem,
  MultiPageSheet,
  MultiPageSheetContent,
  ScrollArea,
  Spinner,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { uniqueId } from "lodash";
import { useEffect, useMemo, useState } from "react";
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { KnowledgeFooter } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeFooter";
import {
  transformSelectionConfigurationsToTree,
  transformTreeToSelectionConfigurations,
} from "@app/components/agent_builder/capabilities/knowledge/transformations";
import { CAPABILITY_CONFIGS } from "@app/components/agent_builder/capabilities/knowledge/utils";
import { generateUniqueActionName } from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { getDefaultConfiguration } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
import { isValidPage } from "@app/components/agent_builder/capabilities/mcp/utils/sheetUtils";
import { DescriptionSection } from "@app/components/agent_builder/capabilities/shared/DescriptionSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/shared/JsonSchemaSection";
import { NameSection } from "@app/components/agent_builder/capabilities/shared/NameSection";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/shared/TimeFrameSection";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type {
  CapabilityFormData,
  ConfigurationSheetPageId,
} from "@app/components/agent_builder/types";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import {
  capabilityFormSchema,
  CONFIGURATION_SHEET_PAGE_IDS,
} from "@app/components/agent_builder/types";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceBuilderProvider } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { DataSourceBuilderSelector } from "@app/components/data_source_view/DataSourceBuilderSelector";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { DataSourceViewSelectionConfigurations } from "@app/types";

interface KnowledgeConfigurationSheetProps {
  onSave: (action: AgentBuilderAction) => void;
  onClose: () => void;
  action: AgentBuilderAction | null;
  actions: AgentBuilderAction[];
  isEditing: boolean;
  mcpServerViews: MCPServerViewType[];
  getAgentInstructions: () => string;
  presetActionData?: any | null;
}

export function KnowledgeConfigurationSheet({
  onSave,
  onClose,
  action,
  actions,
  isEditing,
  mcpServerViews,
  getAgentInstructions,
  presetActionData,
}: KnowledgeConfigurationSheetProps) {
  const open = action !== null;
  const { spaces, isSpacesLoading } = useSpacesContext();

  const handleSave = (
    formData: CapabilityFormData,
    dataSourceConfigurations: DataSourceViewSelectionConfigurations
  ) => {
    const { description, configuration, mcpServerView } = formData;
    const requirements = getMCPServerRequirements(mcpServerView);

    const datasource =
      requirements.requiresDataSourceConfiguration ||
      requirements.requiresDataWarehouseConfiguration
        ? { dataSourceConfigurations: dataSourceConfigurations }
        : { tablesConfigurations: dataSourceConfigurations };

    const isNewActionOrNameChanged = isEditing
      ? defaultValues.name !== formData.name
      : true;

    const newName = isNewActionOrNameChanged
      ? generateUniqueActionName({
          baseName: formData.name,
          existingActions: actions || [],
        })
      : formData.name;

    const newAction: AgentBuilderAction = {
      id: uniqueId(),
      type: "MCP",
      name: newName,
      description,
      configuration: {
        ...configuration,
        mcpServerViewId: mcpServerView?.sId ?? configuration.mcpServerViewId,
        ...datasource,
      },
    };

    onSave(newAction);
    onClose();
  };

  // Custom open hook to only have debounce when we close.
  // We use this value to unmount the Sheet Content, and we need
  // debounce when closing to avoid messing up the closing animation.
  // 300ms is vibe based.
  const [debouncedOpen, setDebouncedOpen] = useState(() => open);
  useEffect(() => {
    if (open) {
      setDebouncedOpen(true);
    } else {
      setTimeout(() => {
        setDebouncedOpen(false);
      }, 300);
    }
  }, [open]);

  // Memoize default values based on action (React Hook Form best practice)
  const defaultValues = useMemo(() => {
    const dataSourceConfigurations =
      action?.configuration?.dataSourceConfigurations;

    const dataSourceTree =
      dataSourceConfigurations && action
        ? transformSelectionConfigurationsToTree(
            dataSourceConfigurations as DataSourceViewSelectionConfigurations
          ) // TODO: fix type
        : { in: [], notIn: [] };

    let selectedMCPServerView;
    
    if (isEditing && action && action.type === "MCP") {
      // Editing existing action - find by ID
      selectedMCPServerView = mcpServerViews.find(
        (mcpServerView) =>
          mcpServerView.sId === action.configuration.mcpServerViewId
      );
    } else if (presetActionData) {
      // New action from preset - map preset type to server name
      const serverNameMap: Record<string, string> = {
        "RETRIEVAL_SEARCH": "search",
        "TABLES_QUERY": "query_tables",
        "PROCESS": "extract_data",
      };
      const targetServerName = serverNameMap[presetActionData.type];
      selectedMCPServerView = mcpServerViews.find(
        (view) => view.server.name === targetServerName
      );
    } else {
      // Default to search
      selectedMCPServerView = mcpServerViews.find((view) => view.server.name === "search");
    }

    return {
      sources: dataSourceTree,
      description: action?.description ?? presetActionData?.description ?? "",
      configuration:
        action?.configuration ?? getDefaultConfiguration(selectedMCPServerView),
      mcpServerView: selectedMCPServerView ?? null,
      name:
        action?.name ??
        presetActionData?.name ??
        selectedMCPServerView?.name ??
        selectedMCPServerView?.server.name ??
        "",
    };
  }, [action, mcpServerViews, isEditing, presetActionData]);

  const formMethods = useForm<CapabilityFormData>({
    resolver: zodResolver(capabilityFormSchema),
    defaultValues,
  });

  // Reset form when defaultValues change (e.g., when editing different actions)
  useEffect(() => {
    formMethods.reset(defaultValues);
  }, [defaultValues, formMethods]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      onClose();
      formMethods.reset(defaultValues);
    }
  };

  if (isSpacesLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner variant="dark" size="md" />
      </div>
    );
  }

  return (
    <MultiPageSheet open={open} onOpenChange={handleOpenChange}>
      <FormProvider {...formMethods}>
        {debouncedOpen && (
          <DataSourceBuilderProvider spaces={spaces}>
            <KnowledgeConfigurationSheetContent
              onSave={handleSave}
              open={open}
              getAgentInstructions={getAgentInstructions}
              isEditing={isEditing}
              presetActionData={presetActionData}
            />
          </DataSourceBuilderProvider>
        )}
      </FormProvider>
    </MultiPageSheet>
  );
}

interface KnowledgeConfigurationSheetContentProps {
  onSave: (
    formData: CapabilityFormData,
    dataSourceConfigurations: DataSourceViewSelectionConfigurations
  ) => void;
  open: boolean;
  getAgentInstructions: () => string;
  isEditing: boolean;
  presetActionData?: any | null;
}

function KnowledgeConfigurationSheetContent({
  onSave,
  open,
  getAgentInstructions,
  isEditing,
  presetActionData,
}: KnowledgeConfigurationSheetContentProps) {
  const { handleSubmit, setValue, getValues } =
    useFormContext<CapabilityFormData>();

  const mcpServerView = useWatch<CapabilityFormData, "mcpServerView">({
    name: "mcpServerView",
  });
  const sources = useWatch<CapabilityFormData, "sources">({
    name: "sources",
  });

  const hasSourceSelection = sources.in.length > 0;
  const hasMCPServerSelection = mcpServerView !== null;

  const config = useMemo(() => {
    if (mcpServerView !== null) {
      return CAPABILITY_CONFIGS[mcpServerView.server.name ?? ""];
    }
    return null;
  }, [mcpServerView]);

  const requirements = useMemo(() => {
    return getMCPServerRequirements(mcpServerView);
  }, [mcpServerView]);

  const viewType = useMemo(() => {
    if (requirements.requiresTableConfiguration) {
      return "table";
    }
    if (requirements.requiresDataWarehouseConfiguration) {
      return "data_warehouse";
    }
    if (requirements.requiresDataSourceConfiguration) {
      return "document";
    }
    return "all";
  }, [requirements]);

  const { owner } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const { mcpServerViewsWithKnowledge, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  // When we have a preset action, skip to data source selection since we already know the MCP server
  const initialPageId = isEditing
    ? CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION
    : presetActionData
    ? CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION
    : CONFIGURATION_SHEET_PAGE_IDS.MCP_SERVER_SELECTION;

  const [currentPageId, setCurrentPageId] =
    useState<ConfigurationSheetPageId>(initialPageId);

  useEffect(() => {
    if (!open) {
      // Reset to initial state when closing
      setCurrentPageId(
        presetActionData 
          ? CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION 
          : CONFIGURATION_SHEET_PAGE_IDS.MCP_SERVER_SELECTION
      );
      return;
    }

    if (isEditing) {
      setCurrentPageId(CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION);
    } else if (presetActionData) {
      setCurrentPageId(CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION);
    }
  }, [isEditing, open, presetActionData]);

  const handlePageChange = (pageId: string) => {
    if (isValidPage(pageId, CONFIGURATION_SHEET_PAGE_IDS)) {
      setCurrentPageId(pageId);
    }
  };

  const handleMCPServerSelection = (mcpServerView: MCPServerViewType) => {
    setValue("mcpServerView", mcpServerView);

    const currentName = getValues("name");
    if (!currentName || !isEditing) {
      setValue("name", mcpServerView.name ?? mcpServerView.server.name ?? "");
    }

    setValue("configuration.mcpServerViewId", mcpServerView.sId);
    setCurrentPageId(CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION);
  };

  const pages: MultiPageSheetPage[] = [
    {
      id: CONFIGURATION_SHEET_PAGE_IDS.MCP_SERVER_SELECTION,
      title: "Choose your processing method",
      description: "Select how you want to process and access your data",
      icon: BookOpenIcon,
      content: (
        <div className="space-y-4">
          {isMCPServerViewsLoading && (
            <div className="flex h-40 w-full items-center justify-center">
              <Spinner />
            </div>
          )}
          {!isMCPServerViewsLoading && (
            <>
              <span className="text-sm font-semibold">
                Available processing methods:
              </span>
              <ContextItem.List>
                {mcpServerViewsWithKnowledge.map((view) => (
                  <ContextItem
                    key={view.id}
                    title={getMcpServerViewDisplayName(view)}
                    visual={getAvatar(view.server, "sm")}
                    onClick={() => handleMCPServerSelection(view)}
                  >
                    <ContextItem.Description
                      description={getMcpServerViewDescription(view)}
                    />
                  </ContextItem>
                ))}
              </ContextItem.List>
            </>
          )}
        </div>
      ),
    },
    {
      id: CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION,
      title: requirements.requiresTableConfiguration
        ? "Select Tables"
        : "Select Data Sources",
      description: requirements.requiresTableConfiguration
        ? "Choose the tables to query for your processing method"
        : "Choose the data sources to include in your knowledge base",
      icon: undefined,
      content: (
        <div className="space-y-4">
          <ScrollArea>
            <DataSourceBuilderSelector
              dataSourceViews={supportedDataSourceViews}
              owner={owner}
              viewType={viewType}
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
          <NameSection
            title="Tool Name"
            description="Customize the name of this knowledge tool to reference it in your instructions."
            label="Name"
            placeholder="search_gdrive"
            helpText="Use lowercase letters, numbers, and underscores only. No spaces allowed."
          />

          {requirements.mayRequireTimeFrameConfiguration && (
            <TimeFrameSection actionType="extract" />
          )}

          {requirements.mayRequireJsonSchemaConfiguration && (
            <JsonSchemaSection getAgentInstructions={getAgentInstructions} />
          )}

          {config && <DescriptionSection {...config?.descriptionConfig} />}
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
        // Transform the tree structure to selection configurations
        const dataSourceConfigurations = transformTreeToSelectionConfigurations(
          formData.sources,
          supportedDataSourceViews
        );

        onSave(formData, dataSourceConfigurations);
      })}
      size="xl"
      showHeaderNavigation={false}
      disableNext={
        currentPageId === CONFIGURATION_SHEET_PAGE_IDS.MCP_SERVER_SELECTION
          ? !hasMCPServerSelection
          : currentPageId === CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION
            ? !hasSourceSelection
            : false
      }
      footerContent={<KnowledgeFooter />}
    />
  );
}
