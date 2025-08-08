import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  MultiPageSheet,
  MultiPageSheetContent,
  MultiPageSheetTrigger,
  ScrollArea,
} from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { BookOpenIcon } from "@dust-tt/sparkle";
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
import {
  transformSelectionConfigurationsToTree,
  transformTreeToSelectionConfigurations,
} from "@app/components/agent_builder/capabilities/knowledge/transformations";
import { CAPABILITY_CONFIGS } from "@app/components/agent_builder/capabilities/knowledge/utils";
import { getDefaultConfiguration } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
import { MCPServerViewsKnowledgeDropdown } from "@app/components/agent_builder/capabilities/MCPServerViewsKnowledgeDropdown";
import { DescriptionSection } from "@app/components/agent_builder/capabilities/shared/DescriptionSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/shared/JsonSchemaSection";
import { isValidPage } from "@app/components/agent_builder/capabilities/shared/sheetUtils";
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
import { DataSourceBuilderSelector } from "@app/components/data_source_view/DataSourceBuilderSelector";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { DataSourceViewSelectionConfigurations } from "@app/types";

interface KnowledgeConfigurationSheetProps {
  onSave: (action: AgentBuilderAction) => void;
  onClose: () => void;
  onClickKnowledge: () => void;
  action: AgentBuilderAction | null;
  isEditing: boolean;
  mcpServerViews: MCPServerViewType[];
  getAgentInstructions: () => string;
}

export function KnowledgeConfigurationSheet({
  onSave,
  onClose,
  onClickKnowledge,
  action,
  isEditing,
  mcpServerViews,
  getAgentInstructions,
}: KnowledgeConfigurationSheetProps) {
  const open = action !== null;

  const handleSave = (
    formData: CapabilityFormData,
    dataSourceConfigurations: DataSourceViewSelectionConfigurations
  ) => {
    const { name, description, configuration, mcpServerView } = formData;
    const requirements = getMCPServerRequirements(mcpServerView);

    const datasource = requirements.requiresDataSourceConfiguration
      ? { dataSourceConfigurations: dataSourceConfigurations }
      : { tablesConfigurations: dataSourceConfigurations };

    const newAction: AgentBuilderAction = {
      id: uniqueId(),
      type: "MCP",
      name,
      description,
      configuration: {
        ...configuration,
        ...datasource,
      },
    };

    onSave(newAction);
    onClose();
  };

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

    const selectedMCPServerView =
      isEditing && action && action.type === "MCP"
        ? mcpServerViews.find(
            (mcpServerView) =>
              mcpServerView.sId === action.configuration.mcpServerViewId
          )
        : mcpServerViews.find((view) => view.server.name === "search"); // select search as default

    return {
      sources: dataSourceTree,
      description: action?.description ?? "",
      configuration:
        action?.configuration ?? getDefaultConfiguration(selectedMCPServerView),
      mcpServerView: selectedMCPServerView ?? null,
      name: selectedMCPServerView?.server.name,
    };
  }, [action, mcpServerViews, isEditing]);

  const formMethods = useForm<CapabilityFormData>({
    resolver: zodResolver(capabilityFormSchema),
    defaultValues,
  });

  // Reset form when action changes (recommended pattern for dynamic data)
  useEffect(() => {
    formMethods.reset(defaultValues);
  }, [defaultValues, formMethods]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      onClose();
    }
  };

  return (
    <MultiPageSheet open={open} onOpenChange={handleOpenChange}>
      <MultiPageSheetTrigger asChild>
        <Button
          label="Add knowledge"
          onClick={onClickKnowledge}
          icon={BookOpenIcon}
        />
      </MultiPageSheetTrigger>
      <FormProvider {...formMethods}>
        <KnowledgeConfigurationSheetContent
          onSave={handleSave}
          open={open}
          getAgentInstructions={getAgentInstructions}
          isEditing={isEditing}
        />
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
}

function KnowledgeConfigurationSheetContent({
  onSave,
  open,
  getAgentInstructions,
  isEditing,
}: KnowledgeConfigurationSheetContentProps) {
  const { control, handleSubmit, setValue } =
    useFormContext<CapabilityFormData>();

  const mcpServerView = useWatch<CapabilityFormData, "mcpServerView">({
    name: "mcpServerView",
  });
  const sources = useWatch<CapabilityFormData, "sources">({
    name: "sources",
  });

  const hasSourceSelection = sources.in.length > 0 || sources.notIn.length > 0;

  const config = useMemo(() => {
    if (mcpServerView !== null) {
      return CAPABILITY_CONFIGS[mcpServerView.server.name ?? ""];
    }
    return null;
  }, [mcpServerView]);

  const requirements = useMemo(() => {
    return getMCPServerRequirements(mcpServerView);
  }, [mcpServerView]);

  const { owner } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const { spaces } = useSpacesContext();
  const { mcpServerViewsWithKnowledge, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  const initialPageId = isEditing
    ? CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION
    : CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION;

  const [currentPageId, setCurrentPageId] =
    useState<ConfigurationSheetPageId>(initialPageId);

  useEffect(() => {
    if (!open) {
      setCurrentPageId(CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION);

      return;
    }

    if (isEditing) {
      setCurrentPageId(CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION);
    }
  }, [isEditing, open]);

  const handlePageChange = (pageId: string) => {
    if (isValidPage(pageId, CONFIGURATION_SHEET_PAGE_IDS)) {
      setCurrentPageId(pageId);
    }
  };

  const handleMCPServerSelection = (mcpServerView: MCPServerViewType) => {
    setValue("mcpServerView", mcpServerView);
    setValue("name", mcpServerView.name ?? mcpServerView.server.name ?? "");
    setValue("configuration.mcpServerViewId", mcpServerView.sId);
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
                selectedMcpServerView={mcpServerView}
              />
            </div>
          </div>
          <hr className="border-gray-200" />
          <div className="space-y-6">
            {requirements.mayRequireTimeFrameConfiguration && (
              <TimeFrameSection actionType="extract" />
            )}

            {requirements.mayRequireJsonSchemaConfiguration && (
              <JsonSchemaSection
                owner={owner}
                getAgentInstructions={getAgentInstructions}
              />
            )}

            {config && <DescriptionSection {...config?.descriptionConfig} />}
          </div>
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
      showNavigation
      disableNext={!hasSourceSelection}
    />
  );
}
