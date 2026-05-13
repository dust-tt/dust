import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAuthContext } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UseAuditLogsToggleProps {
  owner: LightWorkspaceType;
}

export function useAuditLogsToggle({ owner }: UseAuditLogsToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const { mutateAuthContext } = useAuthContext({ workspaceId: owner.sId });
  const isEnabled = owner.metadata?.disableAuditLogs !== true;

  const doToggleAuditLogs = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          disableAuditLogs: isEnabled,
        }),
      });

      if (!res.ok) {
        let description = "Failed to update audit logs setting";
        try {
          const body = await res.json();
          if (body?.error?.message) {
            description = body.error.message;
          }
        } catch {
          // JSON parse failure — keep fallback
        }
        sendNotification({
          type: "error",
          title: "Failed to update audit logs setting",
          description,
        });
        return;
      }

      // Revalidation is best-effort; failure does not mean the toggle failed.
      mutateAuthContext().catch(() => {
        // Non-critical — the toggle succeeded. Context will sync on next navigation.
      });
    } finally {
      setIsChanging(false);
    }
  };

  return {
    isEnabled,
    isChanging,
    doToggleAuditLogs,
  };
}
