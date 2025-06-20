import { SliderToggle } from "@dust-tt/sparkle";

import type { AssistantBuilderMCPServerConfiguration } from "@app/components/assistant_builder/types";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface CustomToggleSectionProps {
  title: string;
  description: string;
  configurationKey: string;
  selectedMCPServerView?: MCPServerViewType;
  targetMCPServerName: InternalMCPServerNameType;
  actionConfiguration: AssistantBuilderMCPServerConfiguration;
  handleConfigUpdate: (
    getNewConfig: (
      old: AssistantBuilderMCPServerConfiguration
    ) => AssistantBuilderMCPServerConfiguration
  ) => void;
}

/**
 * Custom toggle section that stores a boolean configuration in the additionalConfiguration.
 */
export function CustomToggleSection({
  title,
  description,
  selectedMCPServerView,
  targetMCPServerName,
  configurationKey,
  actionConfiguration,
  handleConfigUpdate,
}: CustomToggleSectionProps) {
  const isTargetServer =
    selectedMCPServerView?.serverType === "internal" &&
    selectedMCPServerView.server.name === targetMCPServerName;

  if (!isTargetServer) {
    return null;
  }

  const isEnabled =
    actionConfiguration.additionalConfiguration[configurationKey] === true;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {description}
            </p>
          )}
        </div>
        <SliderToggle
          size="sm"
          selected={isEnabled}
          onClick={() =>
            handleConfigUpdate((old) => ({
              ...old,
              additionalConfiguration: {
                ...old.additionalConfiguration,
                [configurationKey]: !isEnabled,
              },
            }))
          }
        />
      </div>
    </div>
  );
}
