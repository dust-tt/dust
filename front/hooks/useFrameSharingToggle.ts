import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type {
  LightWorkspaceType,
  WorkspaceSharingPolicy,
} from "@app/types/user";
import { useCallback, useState } from "react";

interface UseFrameSharingToggleProps {
  owner: LightWorkspaceType;
}

export function useFrameSharingToggle({ owner }: UseFrameSharingToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const [sharingPolicy, setSharingPolicy] = useState<WorkspaceSharingPolicy>(
    owner.sharingPolicy ?? "all_scopes"
  );
  const sendNotification = useSendNotification();

  const doUpdateSharingPolicy = useCallback(
    async (newPolicy: WorkspaceSharingPolicy) => {
      setIsChanging(true);
      try {
        const res = await clientFetch(`/api/w/${owner.sId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sharingPolicy: newPolicy }),
        });

        if (!res.ok) {
          throw new Error("Failed to update Frame sharing setting");
        }

        setSharingPolicy(newPolicy);
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to update Frame sharing setting",
          description: "Could not update the Frame sharing policy.",
        });
      } finally {
        setIsChanging(false);
      }
    },
    [owner.sId, sendNotification]
  );

  return {
    isChanging,
    sharingPolicy,
    doUpdateSharingPolicy,
  };
}
