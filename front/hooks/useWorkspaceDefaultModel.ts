import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type {
  LightWorkspaceType,
  WorkspaceDefaultModelSetting,
} from "@app/types/user";
import { useCallback, useState } from "react";

interface UseWorkspaceDefaultModelParams {
  owner: LightWorkspaceType;
  mutateWorkspace: () => Promise<unknown>;
}

// Persists the workspace default model. Pass `null` to clear it ("automatic":
// resolve live to the best available model). Success/failure notifications are
// sent from here per [REACT2].
export function useWorkspaceDefaultModel({
  owner,
  mutateWorkspace,
}: UseWorkspaceDefaultModelParams) {
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);

  const updateDefaultModel = useCallback(
    async (model: WorkspaceDefaultModelSetting | null) => {
      setIsSaving(true);
      try {
        const response = await clientFetch(`/api/w/${owner.sId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceDefaultModel: model }),
        });

        if (!response.ok) {
          throw new Error("Failed to update the workspace default model");
        }

        sendNotification({
          type: "success",
          title: "Default model updated",
          description: model
            ? "The workspace default model has been set."
            : "The workspace default model is now automatic.",
        });

        await mutateWorkspace();
        return true;
      } catch {
        sendNotification({
          type: "error",
          title: "Update failed",
          description:
            "An unexpected error occurred while updating the default model.",
        });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [owner.sId, mutateWorkspace, sendNotification]
  );

  return { updateDefaultModel, isSaving };
}
