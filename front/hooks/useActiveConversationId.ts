import { useMemo } from "react";

import { useAppRouter } from "@app/lib/platform";

export function useActiveConversationId() {
  const router = useAppRouter();

  const activeConversationId = useMemo(() => {
    const conversationId = router.query.cId ?? "";

    if (conversationId && typeof conversationId === "string") {
      return conversationId === "new" ? null : conversationId;
    }

    return null;
  }, [router.query.cId]);

  return activeConversationId;
}
