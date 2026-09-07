import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useExtensionMcpToolsToggle } from "@app/hooks/useExtensionMcpToolsToggle";
import type { LightWorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";

export const EXTENSION_MCP_TOOLS_LABEL = "Browser Extension Tools";
export const EXTENSION_MCP_TOOLS_DESCRIPTION =
  "Whether the Dust browser extension is allowed to list and read browser tabs.";

interface ExtensionMcpToolsSectionProps {
  owner: LightWorkspaceType;
}

export function ExtensionMcpToolsSection({
  owner,
}: ExtensionMcpToolsSectionProps) {
  const { isEnabled, isChanging, doToggleExtensionMcpTools } =
    useExtensionMcpToolsToggle({ owner });

  return (
    <GovernanceSettingRowLayout
      label={EXTENSION_MCP_TOOLS_LABEL}
      description={EXTENSION_MCP_TOOLS_DESCRIPTION}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={() => void doToggleExtensionMcpTools()}
        />
      }
    />
  );
}
