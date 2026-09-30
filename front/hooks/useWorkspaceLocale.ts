import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAuthContext } from "@app/lib/swr/workspaces";
import type { SupportedLocale } from "@app/types/locale";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UseWorkspaceLocaleProps {
  owner: WorkspaceType;
}

export function useWorkspaceLocale({ owner }: UseWorkspaceLocaleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const { mutateAuthContext } = useAuthContext({ workspaceId: owner.sId });

  const doUpdateWorkspaceLocale = async (
    locale: SupportedLocale
  ): Promise<boolean> => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ locale }),
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Failed to update the workspace language",
          description: "Could not update the workspace language.",
        });
        return false;
      }

      // Revalidation is best-effort; failure does not mean the update failed.
      await mutateAuthContext().catch(() => {
        // Non-critical — the update succeeded. Context will sync on next navigation.
      });
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update the workspace language",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsChanging(false);
    }

    return true;
  };

  return {
    workspaceLocale: owner.locale,
    isChanging,
    doUpdateWorkspaceLocale,
  };
}
