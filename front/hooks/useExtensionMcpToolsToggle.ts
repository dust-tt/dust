import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UseExtensionMcpToolsToggleProps {
  owner: LightWorkspaceType;
}

export function useExtensionMcpToolsToggle({
  owner,
}: UseExtensionMcpToolsToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    !owner.metadata?.disableExtensionMcpTools
  );

  const doToggleExtensionMcpTools = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          disableExtensionMcpTools: isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update extension MCP tools setting");
      }

      setIsEnabled(!isEnabled);
    } catch {
      sendNotification({
        type: "error",
        title: "Failed to update extension MCP tools setting",
        description:
          "Could not update the browser extension MCP tools setting.",
      });
    }
    setIsChanging(false);
  };

  return {
    isEnabled,
    isChanging,
    doToggleExtensionMcpTools,
  };
}
