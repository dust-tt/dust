import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useExtensionMcpToolsToggle } from "@app/hooks/useExtensionMcpToolsToggle";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";

const LABEL = "Browser Extension Tools";
const DESCRIPTION =
  "Whether the Dust browser extension can use MCP tools such as " +
  "listing and reading browser tabs.";

interface ExtensionMcpToolsSectionProps {
  owner: LightWorkspaceType;
}

export function ExtensionMcpToolsSection({
  owner,
}: ExtensionMcpToolsSectionProps) {
  const { isEnabled, isChanging, doToggleExtensionMcpTools } =
    useExtensionMcpToolsToggle({ owner });
  const { hasFeature } = useFeatureFlags();

  if (!hasFeature("browser_extension_mcp_tools")) {
    return null;
  }

  return (
    <GovernanceSettingRowLayout
      label={LABEL}
      description={DESCRIPTION}
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
