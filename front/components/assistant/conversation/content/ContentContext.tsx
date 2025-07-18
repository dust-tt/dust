import { useRouter } from "next/router";
import React, { createContext, useContext, useEffect, useState } from "react";

interface ContentContextType {
  isContentOpen: boolean;
  contentId: string | null;
  openContent: (id: string) => void;
  closeContent: () => void;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export function useContentContext() {
  const context = useContext(ContentContext);
  if (!context) {
    throw new Error("useContentContext must be used within a ContentProvider");
  }
  return context;
}

interface ContentProviderProps {
  children: React.ReactNode;
}

export function ContentProvider({ children }: ContentProviderProps) {
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

  const value: ContentContextType = {
    isContentOpen,
    contentId,
    openContent,
    closeContent,
  };

  return (
    <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
  );
}
