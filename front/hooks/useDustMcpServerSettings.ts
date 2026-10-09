import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import type { DustMcpServerSettings } from "@app/lib/api/mcp_server/dust_mcp_server_settings";
import { getDustMcpServerSettingsFromMetadata } from "@app/lib/api/mcp_server/dust_mcp_server_settings";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { useAuthContext } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

interface UseDustMcpServerSettingsProps {
  owner: LightWorkspaceType;
}

export function useDustMcpServerSettings({
  owner,
}: UseDustMcpServerSettingsProps) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
        throw await getErrorFromResponse(res);
      }

      setSettings(nextSettings);
      // Revalidation is best-effort; failure does not mean the save failed.
      await mutateAuthContext().catch(() => {
        // Non-critical — settings will sync on next navigation.
      });
      return true;
    } catch (error) {
      sendApiErrorNotification({
        title: t`Failed to update the Dust MCP server settings`,
        error,
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
