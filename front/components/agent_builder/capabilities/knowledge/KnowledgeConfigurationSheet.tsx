import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  Avatar,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  MultiPageSheet,
  MultiPageSheetContent,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import uniqueId from "lodash/uniqueId";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";

import { DataSourceBuilderSelector } from "@app/components/agent_builder/capabilities/knowledge/DataSourceBuilderSelector";
import { transformTreeToSelectionConfigurations } from "@app/components/agent_builder/capabilities/knowledge/transformations";
import {
  CAPABILITY_CONFIGS,
  getInitialPageId,
  getKnowledgeDefaultValues,
} from "@app/components/agent_builder/capabilities/knowledge/utils";
import {
  generateUniqueActionName,
  nameToDisplayFormat,
  nameToStorageFormat,
} from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { isValidPage } from "@app/components/agent_builder/capabilities/mcp/utils/sheetUtils";
import { CustomCheckboxSection } from "@app/components/agent_builder/capabilities/shared/CustomCheckboxSection";
import { DescriptionSection } from "@app/components/agent_builder/capabilities/shared/DescriptionSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/shared/JsonSchemaSection";
import {
  NAME_FIELD_NAME,
  NameSection,
} from "@app/components/agent_builder/capabilities/shared/NameSection";
import { ProcessingMethodSection } from "@app/components/agent_builder/capabilities/shared/ProcessingMethodSection";
import { SelectedDataSources } from "@app/components/agent_builder/capabilities/shared/SelectedDataSources";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/shared/TimeFrameSection";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import type {
  AgentBuilderAction,
  CapabilityFormData,
} from "@app/components/agent_builder/types";
import {
  capabilityFormSchema,
  CONFIGURATION_SHEET_PAGE_IDS,
} from "@app/components/agent_builder/types";
import { ConfirmContext } from "@app/components/Confirm";
import { DataSourceBuilderProvider } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import {
  KnowledgePageProvider,
  useKnowledgePageContext,
} from "@app/components/data_source_view/context/PageContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import {
  ADVANCED_SEARCH_SWITCH,
  SEARCH_SERVER_NAME,
} from "@app/lib/actions/mcp_internal_actions/server_constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { TemplateActionPreset } from "@app/types";

import { KnowledgeFooter } from "./KnowledgeFooter";

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
  action,
  ...props
}: KnowledgeConfigurationSheetProps) {
  const confirm = useContext(ConfirmContext);
  const open = action !== null;
  const [isDirty, setIsDirty] = useState(false);

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

  const handlePageChange = async () => {
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

    props.onClose();
  };

  return (
    <MultiPageSheet open={open} onOpenChange={handlePageChange}>
      {debouncedOpen && (
        <KnowledgeConfigurationSheetForm
          action={action}
          setIsDirty={setIsDirty}
          onCancel={handlePageChange}
          {...props}
        />
      )}
    </MultiPageSheet>
  );
}

type KnowledgeConfigurationSheetFormProps = KnowledgeConfigurationSheetProps & {
  setIsDirty: (value: boolean) => void;
  onCancel: () => Promise<void>;
};

function KnowledgeConfigurationSheetForm({
  action,
  actions,
  isEditing,
  mcpServerViews,
  presetActionData,
  getAgentInstructions,
  onClose,
  onSave,
  onCancel,
  setIsDirty,
}: KnowledgeConfigurationSheetFormProps) {
  const { supportedDataSourceViews } = useDataSourceViewsContext();

  const handleSave = (formData: CapabilityFormData) => {
    const { description, configuration, mcpServerView } = formData;
    const {
      requiresDataSourceConfiguration,
      requiresDataWarehouseConfiguration,
    } = getMCPServerRequirements(mcpServerView);

    // Transform the tree structure to selection configurations
    const dataSourceConfigurations = transformTreeToSelectionConfigurations(
      formData.sources,
      supportedDataSourceViews
    );

    const datasource =
      requiresDataSourceConfiguration || requiresDataWarehouseConfiguration
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
            existingActions: isEditing
              ? (actions || []).filter((a) => a.id !== action?.id)
              : actions || [],
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

  // Memoize default values based on action (React Hook Form best practice)
  const defaultValues = useMemo(() => {
    return getKnowledgeDefaultValues({
      action,
      mcpServerViews,
      isEditing,
      presetActionData,
    });
  }, [action, mcpServerViews, isEditing, presetActionData]);

  const form = useForm<CapabilityFormData>({
    resolver: zodResolver(capabilityFormSchema),
    defaultValues,
  });
  const {
    formState: { isDirty },
  } = form;

  useEffect(() => {
    setIsDirty(isDirty);
  }, [isDirty, setIsDirty]);

  return (
    <FormProvider {...form}>
      <DataSourceBuilderProvider>
        <KnowledgePageProvider initialPageId={getInitialPageId(isEditing)}>
          <KnowledgeConfigurationSheetContent
            onSave={form.handleSubmit(handleSave)}
            onCancel={onCancel}
            getAgentInstructions={getAgentInstructions}
            isEditing={isEditing}
          />
        </KnowledgePageProvider>
      </DataSourceBuilderProvider>
    </FormProvider>
  );
}

interface KnowledgeConfigurationSheetContentProps {
  onSave: () => void;
  onCancel: () => Promise<void>;
  getAgentInstructions: () => string;
  isEditing: boolean;
}

function KnowledgeConfigurationSheetContent({
  onSave,
  onCancel,
  getAgentInstructions,
  isEditing,
}: KnowledgeConfigurationSheetContentProps) {
  const { currentPageId, setSheetPageId } = useKnowledgePageContext();
  const { setValue, getValues, setFocus } =
    useFormContext<CapabilityFormData>();
  const [isAdvancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);

  const mcpServerView = useWatch<CapabilityFormData, "mcpServerView">({
    name: "mcpServerView",
  });

  const hasSourceSelection = useWatch({
    compute: (formData: CapabilityFormData) => {
      // Check if we have actual selections: either explicit inclusions or "select all with exclusions"
      const hasExplicitInclusions = formData.sources.in.length > 0;
      const hasSelectAllWithExclusions =
        formData.sources.in.length === 0 && formData.sources.notIn.length > 0;

      return hasExplicitInclusions || hasSelectAllWithExclusions;
    },
  });

  const config = useMemo(() => {
    if (mcpServerView !== null) {
      return CAPABILITY_CONFIGS[mcpServerView.server.name ?? ""];
    }
    return null;
  }, [mcpServerView]);

  const requirements = useMemo(() => {
    return getMCPServerRequirements(mcpServerView);
  }, [mcpServerView]);

  // Focus NameSection input when navigating to CONFIGURATION page
  useEffect(() => {
    if (currentPageId === CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION) {
      const t = setTimeout(() => {
        setFocus(NAME_FIELD_NAME);
      }, 250);
      return () => clearTimeout(t);
    }
  }, [currentPageId, setFocus]);

  // Prefill name field with processing method display name when mcpServerView.id changes
  useEffect(() => {
    if (mcpServerView && !isEditing) {
      const processingMethodName = getMcpServerViewDisplayName(mcpServerView);
      const currentName = getValues("name");
      if (currentName !== processingMethodName) {
        setValue("name", processingMethodName, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
      }
    }
    // We only watch mcpServerView?.id instead of the full object because:
    // 1. When id changes, the entire mcpServerView object updates with new values
    // 2. Object reference can change even if the mcpServerView content is the same
    // 3. Watching the id ensures we re-run when the server actually changes, avoiding name change on form invalidation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcpServerView?.id, isEditing, setValue, getValues]);

  const handlePageChange = useCallback(
    (pageId: string) => {
      if (isValidPage(pageId, CONFIGURATION_SHEET_PAGE_IDS)) {
        setSheetPageId(pageId);
      }
    },
    [setSheetPageId]
  );

  const footerButtons = useMemo(() => {
    const isDataSourcePage =
      currentPageId === CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION;
    const isManageSelectionMode = isDataSourcePage && hasSourceSelection;

    return {
      leftButton: {
        label: "Cancel",
        variant: "outline",
        onClick: async () => {
          if (isManageSelectionMode) {
            setSheetPageId(CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION);
          } else {
            await onCancel();
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
  }, [currentPageId, hasSourceSelection, setSheetPageId, onCancel, onSave]);

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
      content: <DataSourceBuilderSelector viewType="all" />,
      footerContent: <KnowledgeFooter />,
    },
    {
      id: CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      title: config?.configPageTitle || "Configure Knowledge",
      description:
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        config?.configPageDescription ||
        "Select knowledge type and configure settings",
      icon: config
        ? () => <Avatar icon={config.icon} size="md" className="mr-2" />
        : undefined,
      content: (
        <div className="space-y-6">
          <ProcessingMethodSection />

          <NameSection
            title="Name"
            placeholder="Name ..."
            triggerValidationOnChange={true}
          />

          {requirements.mayRequireTimeFrameConfiguration && (
            <TimeFrameSection actionType="extract" />
          )}

          {requirements.mayRequireJsonSchemaConfiguration && (
            <JsonSchemaSection getAgentInstructions={getAgentInstructions} />
          )}

          {config && (
            <DescriptionSection
              {...config?.descriptionConfig}
              triggerValidationOnChange={true}
            />
          )}

          {/* Advanced Settings collapsible section */}
          {mcpServerView?.serverType === "internal" &&
            mcpServerView.server.name === SEARCH_SERVER_NAME && (
              <Collapsible
                open={isAdvancedSettingsOpen}
                onOpenChange={setAdvancedSettingsOpen}
              >
                <CollapsibleTrigger isOpen={isAdvancedSettingsOpen}>
                  <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
                    Advanced Settings
                  </h3>
                </CollapsibleTrigger>
                <CollapsibleContent className="m-1">
                  <CustomCheckboxSection
                    title="Enable exploratory search mode"
                    description="Allow the agent to navigate the selected Data Sources like a filesystem (list folders, browse files, explore hierarchies). Best for complex tasks with large datasets where thoroughness matters more than speed."
                    targetMCPServerName={SEARCH_SERVER_NAME}
                    selectedMCPServerView={mcpServerView ?? undefined}
                    configurationKey={ADVANCED_SEARCH_SWITCH}
                  />
                </CollapsibleContent>
              </Collapsible>
            )}

          <SelectedDataSources />
        </div>
      ),
    },
  ];

  return (
    <MultiPageSheetContent
      pages={pages}
      currentPageId={currentPageId}
      onPageChange={handlePageChange}
      size="xl"
      showHeaderNavigation={false}
      showNavigation={false}
      addFooterSeparator
      {...footerButtons}
    />
  );
}
