import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

export function useConversationBranchActions({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId?: string | null;
}) {
  const sendNotification = useSendNotification();

  const [isMerging, setIsMerging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const mergeBranch = useCallback(
    async (branchId: string) => {
      if (!conversationId) {
        return false;
      }
      setIsMerging(true);
      try {
        const res = await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/branches/${branchId}/merge`,
          { method: "POST" }
        );
        if (!res.ok) {
          throw new Error("Failed to merge branch");
        }
        return true;
      } catch {
        sendNotification({ type: "error", title: "Failed to publish branch" });
        return false;
      } finally {
        setIsMerging(false);
      }
    },
    [conversationId, owner.sId, sendNotification]
  );

  const closeBranch = useCallback(
    async (branchId: string) => {
      if (!conversationId) {
        return false;
      }
      setIsClosing(true);
      try {
        const res = await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/branches/${branchId}/close`,
          { method: "POST" }
        );
        if (!res.ok) {
          throw new Error("Failed to close branch");
        }
        return true;
      } catch {
        sendNotification({ type: "error", title: "Failed to reject branch" });
        return false;
      } finally {
        setIsClosing(false);
      }
    },
    [conversationId, owner.sId, sendNotification]
  );

  return {
    mergeBranch,
    closeBranch,
    isMerging,
    isClosing,
  };
}
