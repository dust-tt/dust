import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  Avatar,
  MultiPageSheet,
  MultiPageSheetContent,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import uniqueId from "lodash/uniqueId";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";

import { DataSourceBuilderSelector } from "@app/components/agent_builder/capabilities/knowledge/DataSourceBuilderSelector";
import { KnowledgeFooter } from "@app/components/agent_builder/capabilities/knowledge/KnowledgeFooter";
import { transformTreeToSelectionConfigurations } from "@app/components/agent_builder/capabilities/knowledge/transformations";
import { CAPABILITY_CONFIGS } from "@app/components/agent_builder/capabilities/knowledge/utils";
import { getKnowledgeDefaultValues } from "@app/components/agent_builder/capabilities/knowledge/utils";
import { getInitialPageId } from "@app/components/agent_builder/capabilities/knowledge/utils";
import {
  generateUniqueActionName,
  nameToDisplayFormat,
  nameToStorageFormat,
} from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
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
import { DataSourceBuilderProvider } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import {
  KnowledgePageProvider,
  useKnowledgePageContext,
} from "@app/components/data_source_view/context/PageContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getMCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";
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
  const { spaces } = useSpacesContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();

  const handleSave = (formData: CapabilityFormData) => {
    const { description, configuration, mcpServerView } = formData;
    const requirements = getMCPServerToolsConfigurations(mcpServerView);

    // Transform the tree structure to selection configurations
    const dataSourceConfigurations = transformTreeToSelectionConfigurations(
      formData.sources,
      supportedDataSourceViews
    );

    const datasource =
      requirements.mayRequireDataSourceConfiguration ||
      requirements.mayRequireDataWarehouseConfiguration
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
      <DataSourceBuilderProvider spaces={spaces}>
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
  const nameSectionRef = useRef<HTMLInputElement>(null);
  const { setValue, getValues } = useFormContext<CapabilityFormData>();

  const mcpServerView = useWatch<CapabilityFormData, "mcpServerView">({
    name: "mcpServerView",
  });
  const hasSourceSelection = useWatch({
    compute: (formData: CapabilityFormData) => {
      return formData.sources.in.length > 0;
    },
  });

  const config = useMemo(() => {
    if (mcpServerView !== null) {
      return CAPABILITY_CONFIGS[mcpServerView.server.name ?? ""];
    }
    return null;
  }, [mcpServerView]);

  const requirements = useMemo(() => {
    return getMCPServerToolsConfigurations(mcpServerView);
  }, [mcpServerView]);

  // Focus NameSection input when navigating to CONFIGURATION page
  useEffect(() => {
    if (currentPageId === CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION) {
      nameSectionRef.current?.focus();
    }
  }, [currentPageId]);

  // Prefill name field with processing method display name when mcpServerView changes
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
  }, [mcpServerView, isEditing, setValue, getValues]);

  const handlePageChange = (pageId: string) => {
    if (isValidPage(pageId, CONFIGURATION_SHEET_PAGE_IDS)) {
      setSheetPageId(pageId);
    }
  };

  const getFooterButtons = () => {
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
  };

  const pages: MultiPageSheetPage[] = [
    {
      id: CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION,
      title: requirements.mayRequireTableConfiguration
        ? "Select Tables"
        : "Select Data Sources",
      description: requirements.mayRequireTableConfiguration
        ? "Choose the tables to query for your processing method"
        : "Choose the data sources to include in your knowledge base",
      icon: undefined,
      noScroll: true,
      content: <DataSourceBuilderSelector viewType="all" />,
      footerContent: hasSourceSelection ? <KnowledgeFooter /> : undefined,
    },
    {
      id: CONFIGURATION_SHEET_PAGE_IDS.CONFIGURATION,
      title: config?.configPageTitle || "Configure Knowledge",
      description:
        config?.configPageDescription ||
        "Select knowledge type and configure settings",
      icon: config
        ? () => <Avatar icon={config.icon} size="md" className="mr-2" />
        : undefined,
      content: (
        <div className="space-y-6">
          <ProcessingMethodSection />

          <NameSection
            ref={nameSectionRef}
            title="Name"
            placeholder="Name ..."
          />

          {requirements.mayRequireTimeFrameConfiguration && (
            <TimeFrameSection actionType="extract" />
          )}

          {requirements.mayRequireJsonSchemaConfiguration && (
            <JsonSchemaSection getAgentInstructions={getAgentInstructions} />
          )}

          {config && <DescriptionSection {...config?.descriptionConfig} />}

          <SelectDataSourcesFilters />
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
      {...getFooterButtons()}
    />
  );
}
