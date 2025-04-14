import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export const useActiveConversationIdSync = () => {
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const router = useRouter();

  useEffect(() => {
    const conversationId = router.query.cId ?? "";

    if (conversationId && typeof conversationId === "string") {
      setActiveConversationId(conversationId === "new" ? null : conversationId);
    }
  }, [router.query.cId]);

  return activeConversationId;
};
