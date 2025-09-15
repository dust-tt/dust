import type { UseFormReturn } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { getDefaultFormValues } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import datadogLogger from "@app/logger/datadogLogger";

/**
 * Creates form reset function for different dialog modes
 * @param configurationTool - Current configuration tool (if any)
 * @param mcpServerView - Current MCP server view (if any)
 * @param isOpen - Whether the dialog is open
 * @returns Reset function that accepts form instance when called
 */
export function createFormResetHandler(
  configurationTool: AgentBuilderAction | null,
  mcpServerView: MCPServerViewType | null,
  isOpen: boolean
) {
  return (form: UseFormReturn<MCPFormData>) => {
    try {
      if (!isOpen) {
        // Dialog closed: reset to empty state and clear errors
        form.reset(getDefaultFormValues(null));
        return;
      }

      if (configurationTool?.type === "MCP") {
        // Edit mode: reset with existing tool data
        form.reset({
          name: configurationTool.name ?? "",
          description: configurationTool.description ?? "",
          configuration: configurationTool.configuration,
        });
      } else if (mcpServerView) {
        // New configuration mode: reset with default values
        const defaultValues = getDefaultFormValues(mcpServerView);
        form.reset({
          ...defaultValues,
          configuration: {
            ...defaultValues.configuration,
            mcpServerViewId: mcpServerView.sId,
          },
        });
      } else {
        // No server view: reset to empty state
        form.reset(getDefaultFormValues(null));
      }
    } catch (error) {
      datadogLogger.warn({ err: error }, "Form reset error");
      // Fallback: reset to default values
      form.reset(getDefaultFormValues(null));
    }
  };
}
