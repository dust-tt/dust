import { SliderToggle } from "@dust-tt/sparkle";

import { ConfigurationSectionContainer } from "@app/components/assistant_builder/actions/configuration/ConfigurationSectionContainer";
import type { AssistantBuilderMCPServerConfiguration } from "@app/components/assistant_builder/types";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface CustomToggleSectionProps {
  title: string;
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

  return (
    <ConfigurationSectionContainer title={title}>
      <SliderToggle
        selected={
          actionConfiguration.additionalConfiguration[configurationKey] === true
        }
        onClick={() =>
          handleConfigUpdate((old) => ({
            ...old,
            additionalConfiguration: {
              ...old.additionalConfiguration,
              [configurationKey]:
                old.additionalConfiguration[configurationKey] !== true,
            },
          }))
        }
      />
    </ConfigurationSectionContainer>
  );
}
