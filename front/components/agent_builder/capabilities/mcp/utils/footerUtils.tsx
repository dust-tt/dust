import React from "react";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { SelectedConfigurationFooter } from "@app/components/agent_builder/capabilities/shared/SelectedConfigurationFooter";
import type { MCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { LightAgentConfigurationType } from "@app/types";

interface FooterContentParams {
  requirements: MCPServerRequirements | null;
  watchedConfiguration: MCPFormData["configuration"] | undefined;
  allAgentConfigurations: LightAgentConfigurationType[];
}

/**
 * Generates footer content for the MCP configuration page based on selected items
 */
export function getConfigurationFooterContent({
  requirements,
  watchedConfiguration,
  allAgentConfigurations,
}: FooterContentParams): React.ReactNode {
  if (!requirements || !watchedConfiguration) {
    return null;
  }

  // Get selected Dust App
  if (
    requirements.requiresDustAppConfiguration &&
    watchedConfiguration.dustAppConfiguration
  ) {
    const dustAppConfig = watchedConfiguration.dustAppConfiguration;
    const selectedApp = {
      sId: dustAppConfig.sId,
      id: dustAppConfig.id,
      name: dustAppConfig.name,
      description: dustAppConfig.description,
    };

    return (
      <SelectedConfigurationFooter
        selectedItem={{ type: "dustApp", app: selectedApp }}
      />
    );
  }

  // Get selected Child Agent
  if (
    requirements.requiresChildAgentConfiguration &&
    watchedConfiguration.childAgentId
  ) {
    const selectedAgent = allAgentConfigurations.find(
      (agent) => agent.sId === watchedConfiguration.childAgentId
    );

    if (selectedAgent) {
      return (
        <SelectedConfigurationFooter
          selectedItem={{ type: "childAgent", agent: selectedAgent }}
        />
      );
    }
  }

  return null;
}
