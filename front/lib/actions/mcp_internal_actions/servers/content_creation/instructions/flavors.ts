import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";

const FLAVOR_INSTRUCTION_TEMPLATE = `
### User's Content Preference
The user wants to create {FLAVOR_LIST} content. Focus on creating
{PLURAL_TEXT} unless the conversation naturally leads to other content types or the user explicitly
requests something else.`;

function getSelectedFlavors(agentLoopContext?: AgentLoopContextType): string[] {
  // Check runContext configuration.
  if (
    agentLoopContext?.runContext &&
    isLightServerSideMCPToolConfiguration(
      agentLoopContext.runContext.toolConfiguration
    )
  ) {
    const flavors =
      agentLoopContext.runContext.toolConfiguration.additionalConfiguration
        ?.flavors;

    if (Array.isArray(flavors)) {
      return flavors;
    }
  }

  // Check listToolsContext configuration.
  if (
    agentLoopContext?.listToolsContext &&
    isServerSideMCPServerConfiguration(
      agentLoopContext.listToolsContext.agentActionConfiguration
    )
  ) {
    const flavors =
      agentLoopContext.listToolsContext.agentActionConfiguration
        .additionalConfiguration?.flavors;

    if (Array.isArray(flavors)) {
      return flavors;
    }
  }

  return [];
}

// List the flavors selected by the user.
function createFlavorInstructions(selectedFlavors: string[]): string {
  if (selectedFlavors.length === 0) {
    return "";
  }

  // If "other" is selected, don't add any flavor constraints - unleash full power.
  if (selectedFlavors.includes("other")) {
    return "";
  }

  return FLAVOR_INSTRUCTION_TEMPLATE.replace(
    "{FLAVOR_LIST}",
    selectedFlavors.join(", ")
  ).replace(
    "{PLURAL_TEXT}",
    selectedFlavors.length === 1
      ? "this type of content"
      : "these types of content"
  );
}

/**
 * Augment Content Creation instructions with flavor-specific guidance
 */
export function augmentContentCreationInstructions(
  baseInstructions: string,
  agentLoopContext?: AgentLoopContextType
): string {
  const selectedFlavors = getSelectedFlavors(agentLoopContext);
  const flavorInstructions = createFlavorInstructions(selectedFlavors);

  if (flavorInstructions) {
    return baseInstructions + flavorInstructions;
  }

  return baseInstructions;
}
