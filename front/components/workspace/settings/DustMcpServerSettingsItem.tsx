import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { DustMcpServerSettingsSheet } from "@app/components/workspace/DustMcpServerSettingsSheet";
import { useDustMcpServerSettings } from "@app/hooks/useDustMcpServerSettings";
import type { WorkspaceType } from "@app/types/user";
import { Button, Settings01, SliderToggle } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface DustMcpServerSettingsItemProps {
  owner: WorkspaceType;
}

export const DUST_MCP_SERVER_LABEL = "MCP server";
export const DUST_MCP_SERVER_DESCRIPTION =
  "Whether external MCP clients can connect to this workspace";

export function DustMcpServerSettingsItem({
  owner,
}: DustMcpServerSettingsItemProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { settings, isSaving, saveSettings } = useDustMcpServerSettings({
    owner,
  });
  const isEnabled = !settings.disabled;

  useEffect(() => {
    if (settings.disabled) {
      setIsSheetOpen(false);
    }
  }, [settings.disabled]);

  const handleToggleEnabled = async () => {
    await saveSettings({
      ...settings,
      disabled: isEnabled,
    });
  };

  return (
    <>
      <GovernanceSettingRowLayout
        label={DUST_MCP_SERVER_LABEL}
        description={DUST_MCP_SERVER_DESCRIPTION}
        action={
          <div className="flex shrink-0 items-center gap-2">
            {isEnabled && (
              <Button
                label="Manage"
                size="xs"
                variant="outline"
                icon={Settings01}
                disabled={isSaving}
                onClick={() => setIsSheetOpen(true)}
              />
            )}
            <SliderToggle
              selected={isEnabled}
              disabled={isSaving}
              onClick={() => {
                void handleToggleEnabled();
              }}
            />
          </div>
        }
      />
      <DustMcpServerSettingsSheet
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        settings={settings}
        isSaving={isSaving}
        onSave={saveSettings}
      />
    </>
  );
}
