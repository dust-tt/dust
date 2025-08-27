import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import uniqueId from "lodash/uniqueId";
import { useContext, useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { DataSourceBuilderSelector } from "@app/components/agent_builder/capabilities/knowledge/DataSourceBuilderSelector";
import { KnowledgeFooter } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeFooter";
import {
  transformSelectionConfigurationsToTree,
  transformTreeToSelectionConfigurations,
} from "@app/components/agent_builder/capabilities/knowledge/transformations";
import { CAPABILITY_CONFIGS } from "@app/components/agent_builder/capabilities/knowledge/utils";
import {
  generateUniqueActionName,
  nameToDisplayFormat,
  nameToStorageFormat,
} from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { getDefaultConfiguration } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
import { isValidPage } from "@app/components/agent_builder/capabilities/mcp/utils/sheetUtils";
import { DescriptionSection } from "@app/components/agent_builder/capabilities/shared/DescriptionSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/shared/JsonSchemaSection";
import { NameSection } from "@app/components/agent_builder/capabilities/shared/NameSection";
import { ProcessingMethodSection } from "@app/components/agent_builder/capabilities/shared/ProcessingMethodSection";
import { SelectDataSourcesFilters } from "@app/components/agent_builder/capabilities/shared/SelectDataSourcesFilters";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/shared/TimeFrameSection";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import {
  capabilityFormSchema,
  CONFIGURATION_SHEET_PAGE_IDS,
} from "@app/components/agent_builder/types";
import { ConfirmContext } from "@app/components/Confirm";
import {
  DataSourceBuilderProvider,
  useDataSourceBuilderContext,
} from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { getMCPServerNameForTemplateAction } from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { TemplateActionPreset } from "@app/types";

interface KnowledgeConfigurationSheetProps {
  onSave: (action: AgentBuilderAction) => void;
  onClose: () => void;
  action: AgentBuilderAction | null;
  actions: AgentBuilderAction[];
  isEditing: boolean;
  mcpServerViews: MCPServerViewType[];
  getAgentInstructions: () => string;
  presetActionData?: TemplateActionPreset;
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
  const { spaces } = useSpacesContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const confirm = useContext(ConfirmContext);

  const handleSave = (formData: CapabilityFormData) => {
    const { description, configuration, mcpServerView } = formData;
    const requirements = getMCPServerRequirements(mcpServerView);

    // Transform the tree structure to selection configurations
    const dataSourceConfigurations = transformTreeToSelectionConfigurations(
      formData.sources,
      supportedDataSourceViews
    );

    const datasource =
      requirements.requiresDataSourceConfiguration ||
      requirements.requiresDataWarehouseConfiguration
        ? { dataSourceConfigurations: dataSourceConfigurations }
        : { tablesConfigurations: dataSourceConfigurations };

    // For editing: check if user actually changed the name by comparing display formats
    const originalDisplayName = action?.name
      ? nameToDisplayFormat(action.name)
      : "";
    const nameActuallyChanged =
      isEditing && originalDisplayName !== formData.name;

    const newName =
      isEditing && !nameActuallyChanged
        ? action!.name // Keep original name when editing without changes
        : generateUniqueActionName({
            baseName: nameToStorageFormat(formData.name),
            existingActions: actions || [],
          });

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
    const tablesConfigurations = action?.configuration?.tablesConfigurations;

    // Use either data source or tables configurations - they're mutually exclusive
    const configurationToUse = dataSourceConfigurations || tablesConfigurations;

    const dataSourceTree =
      configurationToUse && action
        ? transformSelectionConfigurationsToTree(configurationToUse)
        : { in: [], notIn: [] };

    const selectedMCPServerView = (() => {
      if (isEditing && action?.type === "MCP") {
        return mcpServerViews.find(
          (view) => view.sId === action.configuration.mcpServerViewId
        );
      }

      if (presetActionData) {
        const targetServerName =
          getMCPServerNameForTemplateAction(presetActionData);
        return mcpServerViews.find(
          (view) => view.server.name === targetServerName
        );
      }

      return mcpServerViews.find((view) => view.server.name === "search");
    })();

    const storedName =
      action?.name ??
      presetActionData?.name ??
      selectedMCPServerView?.name ??
      selectedMCPServerView?.server.name ??
      "";

    // Convert stored name to user-friendly format for display
    const defaultName = storedName ? nameToDisplayFormat(storedName) : "";

    const defaultDescription =
      action?.description ?? presetActionData?.description ?? "";

    return {
      sources: dataSourceTree,
      description: defaultDescription,
      configuration:
        action?.configuration ?? getDefaultConfiguration(selectedMCPServerView),
      mcpServerView: selectedMCPServerView ?? null,
      name: defaultName,
    };
  }, [action, mcpServerViews, isEditing, presetActionData]);

  const form = useForm<CapabilityFormData>({
    resolver: zodResolver(capabilityFormSchema),
    defaultValues,
  });
  const { reset, formState } = form;
  const { isDirty } = formState;

  // Reset form when defaultValues change (e.g., when editing different actions)
  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const handleOpenChange = async (newOpen: boolean) => {
    if (!newOpen) {
      if (isDirty) {
        const confirmed = await confirm({
          title: "Unsaved changes",
          message:
            "You have unsaved changes. Are you sure you want to close without saving?",
          validateLabel: "Discard changes",
          validateVariant: "warning",
        });

        if (!confirmed) {
          return;
        }
      }

      onClose();
      form.reset(defaultValues);
    }
  };

  const getInitialPageId = () => {
    if (isEditing) {
      return CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION;
    }
    return CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION;
  };

  return (
    <MultiPageSheet open={open} onOpenChange={handleOpenChange}>
      <FormProvider {...form}>
        {debouncedOpen && (
          <DataSourceBuilderProvider
            spaces={spaces}
            initialPageId={getInitialPageId()}
          >
            <KnowledgeConfigurationSheetContent
              onSave={form.handleSubmit(handleSave)}
              onClose={onClose}
              getAgentInstructions={getAgentInstructions}
            />
          </DataSourceBuilderProvider>
        )}
      </FormProvider>
    </MultiPageSheet>
  );
}

interface KnowledgeConfigurationSheetContentProps {
  onSave: () => void;
  onClose: () => void;
  getAgentInstructions: () => string;
}

function KnowledgeConfigurationSheetContent({
  onSave,
  onClose,
  getAgentInstructions,
}: KnowledgeConfigurationSheetContentProps) {
  const { currentPageId, setSheetPageId } = useDataSourceBuilderContext();

  const mcpServerView = useWatch<CapabilityFormData, "mcpServerView">({
    name: "mcpServerView",
  });
  const sources = useWatch<CapabilityFormData, "sources">({
    name: "sources",
  });

  const hasSourceSelection = sources.in.length > 0;

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

  const handlePageChange = (pageId: string) => {
    if (isValidPage(pageId, CONFIGURATION_SHEET_PAGE_IDS)) {
      setSheetPageId(pageId);
    }
  };

  const getFooterButtons = () => {
    const isDataSourcePage =
      currentPageId === CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION;

    return {
      leftButton: {
        label: isDataSourcePage ? "Cancel" : "Back",
        variant: "outline",
        onClick: () => {
          if (isDataSourcePage) {
            onClose();
          } else {
            setSheetPageId(CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION);
          }
        },
      },
      rightButton: {
        label: isDataSourcePage ? "Next" : "Save",
        variant: "primary",
        disabled: isDataSourcePage ? !hasSourceSelection : false,
        onClick: () => {
          if (isDataSourcePage) {
            setSheetPageId(CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION);
          } else {
            onSave();
          }
        },
      },
    };
  };

  const pages: MultiPageSheetPage[] = [
    {
      id: CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION,
      title: requirements.requiresTableConfiguration
        ? "Select Tables"
        : "Select Data Sources",
      description: requirements.requiresTableConfiguration
        ? "Choose the tables to query for your processing method"
        : "Choose the data sources to include in your knowledge base",
      icon: undefined,
      noScroll: true,
      content: (
        <DataSourceBuilderSelector
          dataSourceViews={supportedDataSourceViews}
          owner={owner}
          viewType="all"
        />
      ),
      footerContent: hasSourceSelection ? <KnowledgeFooter /> : undefined,
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
          <SelectDataSourcesFilters />

          <NameSection title="Name" placeholder="Search Google Drive" />

          <ProcessingMethodSection />

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
      onSave={onSave}
      size="xl"
      showHeaderNavigation={false}
      showNavigation={false}
      addFooterSeparator
      {...getFooterButtons()}
    />
  );
}
