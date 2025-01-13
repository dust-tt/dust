import { useRouter } from "next/router";
import type { RefObject } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface ConversationsNavigationContextType {
  conversationsNavigationRef: RefObject<HTMLDivElement>;
  scrollConversationsToTop: () => void;
  assistantIdForDetails: string | null;
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

  const [assistantIdForDetails, setAssistantIdForDetails] = useState<
    string | null
  >(null);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(initialConversationId !== "new" ? initialConversationId ?? null : null);

  useEffect(() => {
    const handleRouteChange = () => {
      const assistantSId = router.query.assistantDetails ?? [];
      // We use shallow browsing when creating a new conversation or navigating to a conversation.
      // Monitor router to update conversation info.
      const conversationId = router.query.cId ?? "";

      if (assistantSId && typeof assistantSId === "string") {
        setAssistantIdForDetails(assistantSId);
      } else {
        setAssistantIdForDetails(null);
      }

      if (
        conversationId &&
        typeof conversationId === "string" &&
        conversationId !== activeConversationId
      ) {
        setActiveConversationId(
          conversationId !== "new" ? conversationId : null
        );
      }
    };

    // Initial check in case the component mounts with the query already set.
    handleRouteChange();

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [
    router.query,
    router.events,
    setActiveConversationId,
    activeConversationId,
  ]);

  return (
    <ConversationsNavigationContext.Provider
      value={{
        conversationsNavigationRef,
        scrollConversationsToTop,
        assistantIdForDetails,
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
