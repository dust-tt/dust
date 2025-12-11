import { useRouter } from "next/router";
import { createContext, useContext, useMemo } from "react";

interface ConversationsNavigationContextType {
  activeConversationId: string | null;
}

const ConversationsNavigationContext =
  createContext<ConversationsNavigationContextType | null>(null);

export function ConversationsNavigationProvider({
  initialConversationId,
  children,
}: {
  initialConversationId?: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const activeConversationId = useMemo(() => {
    const conversationId = router.query.cId ?? "";

    if (conversationId && typeof conversationId === "string") {
      return conversationId === "new" ? null : conversationId;
    }

    return initialConversationId ?? null;
  }, [initialConversationId, router.query.cId]);

  return (
    <ConversationsNavigationContext.Provider
      value={{
        activeConversationId,
      }}
    >
      {children}
    </ConversationsNavigationContext.Provider>
  );
}

export function useConversationsNavigation() {
  const context = useContext(ConversationsNavigationContext);
  if (!context) {
    throw new Error(
      "useConversationsNavigation must be used within a ConversationsNavigationProvider"
    );
  }
  return context;
}
