import { useRouter } from "next/router";
import { useMemo } from "react";

export function useActiveConversationId() {
  const router = useRouter();

  const activeConversationId = useMemo(() => {
    const conversationId = router.query.cId ?? "";

    if (conversationId && typeof conversationId === "string") {
      return conversationId === "new" ? null : conversationId;
    }

    return null;
  }, [router.query.cId]);

  return activeConversationId;
}
