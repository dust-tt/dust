import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { useAuthContext } from "@app/lib/swr/workspaces";
import { areAuditLogsEnabled } from "@app/lib/workspace_policies";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface UseAuditLogsToggleProps {
  owner: LightWorkspaceType;
}

export function useAuditLogsToggle({ owner }: UseAuditLogsToggleProps) {
  const { t } = useLingui();
  const [isChanging, setIsChanging] = useState(false);
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { mutateAuthContext } = useAuthContext({ workspaceId: owner.sId });
  const isEnabled = areAuditLogsEnabled(owner);

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
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to update the audit logs setting`,
          error: errorData,
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
