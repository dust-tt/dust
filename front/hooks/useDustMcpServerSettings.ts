import { useSendNotification } from "@app/hooks/useNotification";
import type { DustMcpServerSettings } from "@app/lib/api/mcp_server/dust_mcp_server_settings";
import { getDustMcpServerSettingsFromMetadata } from "@app/lib/api/mcp_server/dust_mcp_server_settings";
import { clientFetch } from "@app/lib/egress/client";
import { useAuthContext } from "@app/lib/swr/workspaces";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useEffect, useState } from "react";

interface UseDustMcpServerSettingsProps {
  owner: LightWorkspaceType;
}

export function useDustMcpServerSettings({
  owner,
}: UseDustMcpServerSettingsProps) {
  const sendNotification = useSendNotification();
  const { mutateAuthContext } = useAuthContext({ workspaceId: owner.sId });
  const [settings, setSettings] = useState<DustMcpServerSettings>(() =>
    getDustMcpServerSettingsFromMetadata(owner.metadata)
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSettings(getDustMcpServerSettingsFromMetadata(owner.metadata));
  }, [owner.metadata]);

  const saveSettings = async (
    nextSettings: DustMcpServerSettings
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dustMcpServerSettings: nextSettings,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update Dust MCP server settings");
      }

      setSettings(nextSettings);
      // Revalidation is best-effort; failure does not mean the save failed.
      await mutateAuthContext().catch(() => {
        // Non-critical — settings will sync on next navigation.
      });
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update Dust MCP server settings",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    settings,
    isSaving,
    saveSettings,
  };
}
