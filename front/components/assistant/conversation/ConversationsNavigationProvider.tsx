import { useRouter } from "next/router";
import type { RefObject } from "react";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";

interface ConversationsNavigationContextType {
  conversationsNavigationRef: RefObject<HTMLDivElement>;
  scrollConversationsToTop: () => void;
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
  const conversationsNavigationRef = useRef<HTMLDivElement>(null);

  const scrollConversationsToTop = useCallback(() => {
    if (conversationsNavigationRef.current) {
      // Find the ScrollArea viewport
      const viewport = conversationsNavigationRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (viewport) {
        viewport.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }
    }
  }, []);

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
        conversationsNavigationRef,
        scrollConversationsToTop,
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
