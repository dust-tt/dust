import type { UseFormReturn } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type {
  SelectedTool,
  SheetMode,
} from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import type {
  AgentBuilderAction,
  ConfigurationPagePageId,
} from "@app/components/agent_builder/types";
import { TOOLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { pluralize } from "@app/types";

export function isValidPage<T extends Record<string, string>>(
  pageId: string,
  pageIds: T
): pageId is T[keyof T] {
  return Object.values(pageIds).includes(pageId);
}

export function getInitialPageId(
  mode: SheetMode | null
): ConfigurationPagePageId {
  const currentMode = mode?.type ?? "add";

  if (currentMode === "edit" || currentMode === "configure") {
    return TOOLS_SHEET_PAGE_IDS.CONFIGURATION;
  }
  if (currentMode === "info") {
    return TOOLS_SHEET_PAGE_IDS.INFO;
  }
  return TOOLS_SHEET_PAGE_IDS.TOOL_SELECTION;
}

export function getInitialConfigurationTool(
  mode: SheetMode | null
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
  mode: SheetMode | null;
  selectedToolsInSheet: SelectedTool[];
  form: UseFormReturn<MCPFormData>;
  onCancel: () => void;
  onModeChange: (mode: SheetMode | null) => void;
  onAddSelectedTools: () => void;
  onConfigurationSave: (data: MCPFormData) => void;
  resetToSelection: () => void;
}

export function getFooterButtons({
  currentPageId,
  mode,
  selectedToolsInSheet,
  form,
  onCancel,
  onModeChange,
  onAddSelectedTools,
  onConfigurationSave,
  resetToSelection,
}: FooterButtonOptions) {
  const isToolSelectionPage =
    currentPageId === TOOLS_SHEET_PAGE_IDS.TOOL_SELECTION;
  const isConfigurationPage =
    currentPageId === TOOLS_SHEET_PAGE_IDS.CONFIGURATION;
  const isInfoPage = currentPageId === TOOLS_SHEET_PAGE_IDS.INFO;

  if (isToolSelectionPage) {
    return {
      leftButton: {
        label: "Cancel",
        variant: "outline",
        onClick: onCancel,
      },
      rightButton: {
        label:
          selectedToolsInSheet.length > 0
            ? `Add ${selectedToolsInSheet.length} tool${pluralize(selectedToolsInSheet.length)}`
            : "Add tools",
        variant: "primary",
        disabled: selectedToolsInSheet.length === 0,
        onClick: onAddSelectedTools,
      },
    };
  }

  if (isConfigurationPage) {
    if (mode?.type === "edit") {
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

    if (mode?.type === "configure") {
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
    if (mode?.type === "info" && mode.source === "toolDetails") {
      return {
        leftButton: {
          label: "Back",
          variant: "outline",
          onClick: () => onModeChange({ type: "add" }),
        },
      };
    } else {
      return {
        leftButton: {
          label: "Close",
          variant: "primary",
          onClick: onCancel,
        },
      };
    }
  }

  return {};
}

export interface SaveConfigurationOptions {
  mode: SheetMode | null;
  configuredAction: AgentBuilderAction;
  mcpServerView: MCPServerViewTypeWithLabel;
  onActionUpdate?: (action: AgentBuilderAction, index: number) => void;
  onModeChange: (mode: SheetMode | null) => void;
  setSelectedToolsInSheet: React.Dispatch<React.SetStateAction<SelectedTool[]>>;
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
  setSelectedToolsInSheet,
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

  setSelectedToolsInSheet((prev) => {
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
  mode: SheetMode | null,
  defaultFormValues: MCPFormData,
  formData: MCPFormData
): boolean {
  if (mode?.type === "add" || mode?.type === "configure") {
    return true; // Always generate unique names for new actions
  }

  if (mode?.type === "edit") {
    // For editing, only generate a unique name if the user actually changed it
    return defaultFormValues.name !== formData.name;
  }

  return false;
}
