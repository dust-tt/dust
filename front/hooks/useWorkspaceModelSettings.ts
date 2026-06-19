import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

export function useWorkspaceModelSettings(
  owner: LightWorkspaceType,
  mutateWorkspace: () => Promise<unknown>
) {
  const [isSaving, setIsSaving] = useState(false);
  const sendNotification = useSendNotification();

  const saveModelSettings = useCallback(
    async ({
      defaultModelId,
      backupModelId,
    }: {
      defaultModelId: string | null;
      backupModelId: string | null;
    }): Promise<boolean> => {
      setIsSaving(true);
      try {
        const response = await clientFetch(`/api/w/${owner.sId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultModelId, backupModelId }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            body?.error?.message ?? "Failed to update model settings."
          );
        }

        sendNotification({
          type: "success",
          title: "Model settings updated",
          description:
            "The workspace default and backup models have been updated.",
        });

        await mutateWorkspace();
        return true;
      } catch (err) {
        sendNotification({
          type: "error",
          title: "Update failed",
          description:
            err instanceof Error
              ? err.message
              : "An unexpected error occurred while updating model settings.",
        });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [owner.sId, mutateWorkspace, sendNotification]
  );

  return { saveModelSettings, isSaving };
}
