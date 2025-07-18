import { useHashParam } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React from "react";

const INTERACTIVE_CONTENT_HASH_PARAM = "icid";

interface InteractiveContentContextType {
  closeContent: () => void;
  contentId: string | null;
  isContentOpen: boolean;
  openContent: (id: string) => void;
}

const InteractiveContentContext = React.createContext<
  InteractiveContentContextType | undefined
>(undefined);

export function useInteractiveContentContext() {
  const context = React.useContext(InteractiveContentContext);
  if (!context) {
    throw new Error(
      "useInteractiveContentContext must be used within a InteractiveContentProvider"
    );
  }

  return context;
}

interface InteractiveContentProviderProps {
  children: React.ReactNode;
}

export function InteractiveContentProvider({
  children,
}: InteractiveContentProviderProps) {
  const router = useRouter();
  const [contentId, setContentId] = useHashParam(
    INTERACTIVE_CONTENT_HASH_PARAM
  );

  /**
   * Fix for shallow routing not closing interactive content drawer.
   *
   * Issue: When navigating between conversations, Next.js uses shallow routing which changes
   * the URL path (e.g., from /assistant/123#?icid=abc to /assistant/456) but
   * doesn't trigger the 'hashchange' event that useHashParam relies on. This causes the
   * interactive content drawer to remain open when it should close.
   *
   * Solution: Listen to Next.js router events and manually detect when the hash is removed
   * during navigation, then close the drawer by clearing the contentId state.
   */
  React.useEffect(() => {
    const handleRouteChange = () => {
      // If there's no hash after route change, clear the content.
      if (!window.location.hash && contentId) {
        setContentId(undefined);
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => router.events.off("routeChangeComplete", handleRouteChange);
  }, [router.events, contentId, setContentId]);

  const isContentOpen = !!contentId;

  const openContent = React.useCallback(
    (id: string) => {
      setContentId(id);
    },
    [setContentId]
  );

  const closeContent = React.useCallback(() => {
    setContentId(undefined);
  }, [setContentId]);

  const value: InteractiveContentContextType = React.useMemo(
    () => ({
      closeContent,
      contentId: contentId || null,
      isContentOpen,
      openContent,
    }),
    [closeContent, contentId, isContentOpen, openContent]
  );

  return (
    <InteractiveContentContext.Provider value={value}>
      {children}
    </InteractiveContentContext.Provider>
  );
}
