import { DustMcpServerSettingsSheet } from "@app/components/workspace/DustMcpServerSettingsSheet";
import { useDustMcpServerSettings } from "@app/hooks/useDustMcpServerSettings";
import { getMcpResourceServerUrlForClient } from "@app/lib/api/mcp_server/urls";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  ContextItem,
  Server01,
  Settings01,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface DustMcpServerSettingsItemProps {
  owner: WorkspaceType;
}

export function DustMcpServerSettingsItem({
  owner,
}: DustMcpServerSettingsItemProps) {
  const { isAdmin } = useAuth();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { settings, isSaving, saveSettings } = useDustMcpServerSettings({
    owner,
  });
  const isEnabled = !settings.disabled;
  const mcpServerUrl = getMcpResourceServerUrlForClient();

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
      <ContextItem
        title="MCP server"
        subElement={
          <>
            Allow external MCP clients to connect to this workspace via{" "}
            <b>{mcpServerUrl}</b>.
          </>
        }
        visual={<Server01 className="h-6 w-6" />}
        truncateSubElement={true}
        hasSeparatorIfLast={true}
        action={
          <div className="flex shrink-0 items-center gap-2">
            {isEnabled && (
              <Button
                label="Manage"
                size="xs"
                variant="outline"
                icon={Settings01}
                disabled={!isAdmin || isSaving}
                tooltip={
                  !isAdmin
                    ? "Only workspace admins can manage MCP server settings."
                    : undefined
                }
                onClick={() => setIsSheetOpen(true)}
              />
            )}
            <SliderToggle
              selected={isEnabled}
              disabled={!isAdmin || isSaving}
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
