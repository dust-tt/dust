import { useRouter } from "next/router";
import React, { createContext, useContext, useEffect, useState } from "react";

interface InteractiveContentContextType {
  closeContent: () => void;
  contentId: string | null;
  isContentOpen: boolean;
  openContent: (id: string) => void;
}

const InteractiveContentContext = createContext<
  InteractiveContentContextType | undefined
>(undefined);

export function useInteractiveContentContext() {
  const context = useContext(InteractiveContentContext);
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
  const [isContentOpen, setIsContentOpen] = useState(false);
  const [contentId, setContentId] = useState<string | null>(null);

  // Watch URL changes to update content state.
  useEffect(() => {
    const handleRouteChange = () => {
      const urlContentId = router.query.contentId as string;

      if (urlContentId) {
        setContentId(urlContentId);
        setIsContentOpen(true);
      } else {
        setIsContentOpen(false);
        setContentId(null);
      }
    };

    // Check initial route.
    handleRouteChange();

    // Listen for route changes.
    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router]);

  const openContent = (id: string) => {
    // Update URL to include content parameters.
    const currentQuery = { ...router.query };
    currentQuery.contentId = id;

    void router.push(
      {
        pathname: router.pathname,
        query: currentQuery,
      },
      undefined,
      { shallow: true }
    );
  };

  const closeContent = () => {
    // Remove content parameters from URL.
    const currentQuery = { ...router.query };
    delete currentQuery.contentId;

    void router.push(
      {
        pathname: router.pathname,
        query: currentQuery,
      },
      undefined,
      { shallow: true }
    );
  };

  const value: InteractiveContentContextType = {
    closeContent,
    contentId,
    isContentOpen,
    openContent,
  };

  return (
    <InteractiveContentContext.Provider value={value}>
      {children}
    </InteractiveContentContext.Provider>
  );
}
