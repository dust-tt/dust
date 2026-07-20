import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useExtensionMcpToolsToggle } from "@app/hooks/useExtensionMcpToolsToggle";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType } from "@app/types/user";
import { Page, PuzzlePiece01, SliderToggle } from "@dust-tt/sparkle";

import { WorkspaceSection } from "./WorkspaceSection";

interface ExtensionMcpToolsSectionProps {
  owner: LightWorkspaceType;
}

export function ExtensionMcpToolsSection({
  owner,
}: ExtensionMcpToolsSectionProps) {
  const { isEnabled, isChanging, doToggleExtensionMcpTools } =
    useExtensionMcpToolsToggle({ owner });
  const { hasFeature } = useFeatureFlags();

  const label = "Browser Extension Tools";
  const description =
    "Allow the Dust browser extension to use MCP tools such as listing and " +
    "reading browser tabs.";

  if (!hasFeature("browser_extension_mcp_tools")) {
    return null;
  }

  if (hasFeature("admin_governance")) {
    return (
      <GovernanceSettingRowLayout
        label={label}
        description={description}
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

  return (
    <WorkspaceSection title={label} icon={PuzzlePiece01}>
      <div className="flex w-full flex-row items-center gap-2">
        <div className="flex-1">
          <Page.P variant="secondary">
            Allow the Dust browser extension to use MCP tools such as listing
            and reading browser tabs. Disabling this prevents the extension from
            automatically registering any browser tools for this workspace.
            Users will still be able to manually attach tabs content or
            screenshots.
          </Page.P>
        </div>
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={() => void doToggleExtensionMcpTools()}
        />
      </div>
    </WorkspaceSection>
  );
}
