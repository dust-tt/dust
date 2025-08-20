import type { UseFormReturn } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type {
  DialogMode,
  SelectedTool,
} from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsDialog";
import type {
  AgentBuilderAction,
  ConfigurationPagePageId,
} from "@app/components/agent_builder/types";
import { CONFIGURATION_DIALOG_PAGE_IDS } from "@app/components/agent_builder/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { pluralize } from "@app/types";

export function getInitialPageId(
  mode: DialogMode | null
): ConfigurationPagePageId {
  const currentMode = mode?.type ?? "add";

  if (currentMode === "edit" || currentMode === "configure") {
    return CONFIGURATION_DIALOG_PAGE_IDS.CONFIGURATION;
  }
  if (currentMode === "info") {
    return CONFIGURATION_DIALOG_PAGE_IDS.INFO;
  }
  return CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION;
}

export function getInitialConfigurationTool(
  mode: DialogMode | null
): AgentBuilderAction | null {
  if (!mode) {
    return null;
  }

  if (mode.type === "edit" || mode.type === "configure") {
    return mode.action;
  }

  return null;
}

export interface FooterButtonOptions {
  currentPageId: ConfigurationPagePageId;
  modeType: DialogMode["type"];
  selectedToolsInDialog: SelectedTool[];
  form: UseFormReturn<MCPFormData>;
  onCancel: () => void;
  onModeChange: (mode: DialogMode | null) => void;
  onAddSelectedTools: () => void;
  onConfigurationSave: (data: MCPFormData) => void;
  resetToSelection: () => void;
}

export function getFooterButtons({
  currentPageId,
  modeType,
  selectedToolsInDialog,
  form,
  onCancel,
  onModeChange,
  onAddSelectedTools,
  onConfigurationSave,
  resetToSelection,
}: FooterButtonOptions) {
  const isToolSelectionPage =
    currentPageId === CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION;
  const isConfigurationPage =
    currentPageId === CONFIGURATION_DIALOG_PAGE_IDS.CONFIGURATION;
  const isInfoPage = currentPageId === CONFIGURATION_DIALOG_PAGE_IDS.INFO;

  if (isToolSelectionPage) {
    return {
      leftButton: {
        label: "Cancel",
        variant: "outline",
        onClick: onCancel,
      },
      rightButton: {
        label:
          selectedToolsInDialog.length > 0
            ? `Add ${selectedToolsInDialog.length} tool${pluralize(selectedToolsInDialog.length)}`
            : "Add tools",
        variant: "primary",
        disabled: selectedToolsInDialog.length === 0,
        onClick: onAddSelectedTools,
      },
    };
  }

  if (isConfigurationPage) {
    if (modeType === "edit") {
      return {
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: onCancel,
        },
        rightButton: {
          label: "Save Changes",
          variant: "primary",
          onClick: form.handleSubmit(onConfigurationSave),
        },
      };
    }

    if (modeType === "configure") {
      return {
        leftButton: {
          label: "Back",
          variant: "outline",
          onClick: () => onModeChange({ type: "add" }),
        },
        rightButton: {
          label: "Save Configuration",
          variant: "primary",
          onClick: form.handleSubmit(onConfigurationSave),
        },
      };
    }

    return {
      leftButton: {
        label: "Back",
        variant: "outline",
        onClick: resetToSelection,
      },
      rightButton: {
        label: "Save Configuration",
        variant: "primary",
        onClick: form.handleSubmit(onConfigurationSave),
      },
    };
  }

  if (isInfoPage) {
    return {
      rightButton: {
        label: "Close",
        variant: "primary",
        onClick: onCancel,
      },
    };
  }

  return {};
}

export interface SaveConfigurationOptions {
  mode: DialogMode | null;
  configuredAction: AgentBuilderAction;
  mcpServerView: MCPServerViewType;
  onActionUpdate?: (action: AgentBuilderAction, index: number) => void;
  onModeChange: (mode: DialogMode | null) => void;
  setSelectedToolsInDialog: React.Dispatch<
    React.SetStateAction<SelectedTool[]>
  >;
  setIsOpen: (open: boolean) => void;
  sendNotification: (notification: {
    title: string;
    description: string;
    type: "success" | "error";
  }) => void;
}

export function handleConfigurationSave({
  mode,
  configuredAction,
  mcpServerView,
  onActionUpdate,
  onModeChange,
  setSelectedToolsInDialog,
  setIsOpen,
  sendNotification,
}: SaveConfigurationOptions): void {
  if (mode?.type === "edit" && onActionUpdate) {
    // Edit mode: save the updated action and close dialog
    onActionUpdate(configuredAction, mode.index);
    setIsOpen(false);
    onModeChange(null);

    sendNotification({
      title: "Tool updated successfully",
      description: `${getMcpServerViewDisplayName(mcpServerView)} configuration has been updated.`,
      type: "success",
    });
    return;
  }

  setSelectedToolsInDialog((prev) => {
    const existingToolIndex = prev.findIndex(
      (tool) =>
        tool.type === "MCP" &&
        tool.configuredAction?.name === configuredAction.name
    );

    if (existingToolIndex >= 0) {
      // Update existing tool with configuration
      const updated = [...prev];
      updated[existingToolIndex] = {
        type: "MCP",
        view: mcpServerView,
        configuredAction,
      };
      return updated;
    } else {
      // Add new configured tool
      return [
        ...prev,
        {
          type: "MCP",
          view: mcpServerView,
          configuredAction,
        },
      ];
    }
  });

  if (mode?.type === "configure") {
    // Go back to add mode and tool selection
    onModeChange({ type: "add" });
    return;
  }
}

export function shouldGenerateUniqueName(
  mode: DialogMode | null,
  defaultFormValues: MCPFormData,
  formData: MCPFormData
): boolean {
  return (
    mode?.type === "add" ||
    mode?.type === "configure" ||
    (mode?.type === "edit" && defaultFormValues.name !== formData.name)
  );
}
