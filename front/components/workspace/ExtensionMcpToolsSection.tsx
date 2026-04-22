import { useExtensionMcpToolsToggle } from "@app/hooks/useExtensionMcpToolsToggle";
import type { LightWorkspaceType } from "@app/types/user";
import { Page, PuzzleIcon, SliderToggle } from "@dust-tt/sparkle";

import { WorkspaceSection } from "./WorkspaceSection";

interface ExtensionMcpToolsSectionProps {
  owner: LightWorkspaceType;
}

export function ExtensionMcpToolsSection({
  owner,
}: ExtensionMcpToolsSectionProps) {
  const { isEnabled, isChanging, doToggleExtensionMcpTools } =
    useExtensionMcpToolsToggle({ owner });

  return (
    <WorkspaceSection title="Browser Extension Tools" icon={PuzzleIcon}>
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
