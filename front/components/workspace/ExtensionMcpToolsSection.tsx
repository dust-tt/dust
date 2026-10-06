import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useExtensionMcpToolsToggle } from "@app/hooks/useExtensionMcpToolsToggle";
import type { LightWorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface ExtensionMcpToolsSectionProps {
  owner: LightWorkspaceType;
}

export function ExtensionMcpToolsSection({
  owner,
}: ExtensionMcpToolsSectionProps) {
  const { t } = useLingui();
  const { isEnabled, isChanging, doToggleExtensionMcpTools } =
    useExtensionMcpToolsToggle({ owner });

  return (
    <GovernanceSettingRowLayout
      label={t`Browser Extension Tools`}
      description={t`Whether the Dust browser extension is allowed to list and read browser tabs.`}
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
