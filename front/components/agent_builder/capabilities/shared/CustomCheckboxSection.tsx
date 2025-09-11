import { Checkbox } from "@dust-tt/sparkle";
import { useController } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface CustomCheckboxSectionProps {
  title: string;
  description: string;
  configurationKey: string;
  selectedMCPServerView?: MCPServerViewType;
  targetMCPServerName: InternalMCPServerNameType;
}

/**
 * Custom checkbox section that stores a boolean configuration in the additionalConfiguration.
 */
export function CustomCheckboxSection({
  title,
  description,
  selectedMCPServerView,
  targetMCPServerName,
  configurationKey,
}: CustomCheckboxSectionProps) {
  const { field } = useController<MCPFormData>({
    name: `configuration.additionalConfiguration.${configurationKey}`,
  });

  const isTargetServer =
    selectedMCPServerView?.serverType === "internal" &&
    selectedMCPServerView.server.name === targetMCPServerName;

  if (!isTargetServer) {
    return null;
  }

  const isEnabled = field.value === true;

  return (
    <div className="flex flex-col gap-3">
      <span className="font-semibold">{title}</span>
      <div className="flex items-center justify-between gap-2">
        <Checkbox
          checked={isEnabled}
          onCheckedChange={(checked) => field.onChange(checked)}
        />
        <div className="flex-1">
          {description && (
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
