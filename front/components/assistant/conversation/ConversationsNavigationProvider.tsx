import type { RefObject } from "react";
import { createContext, useContext, useRef } from "react";

interface ConversationsNavigationContextType {
  conversationsNavigationRef: RefObject<HTMLDivElement>;
  scrollConversationsToTop: () => void;
}

const ConversationsNavigationContext =
  createContext<ConversationsNavigationContextType | null>(null);

export function ConversationsNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const conversationsNavigationRef = useRef<HTMLDivElement>(null);

  const scrollConversationsToTop = () => {
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
  };

  return (
    <ConversationsNavigationContext.Provider
      value={{
        conversationsNavigationRef,
        scrollConversationsToTop,
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
