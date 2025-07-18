import { useHashParam } from "@dust-tt/sparkle";
import React, { createContext, useCallback, useContext, useMemo } from "react";

const INTERACTIVE_CONTENT_HASH_PARAM = "icid";

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
  const [contentId, setContentId] = useHashParam(
    INTERACTIVE_CONTENT_HASH_PARAM
  );

  const isContentOpen = !!contentId;

  const openContent = useCallback(
    (id: string) => {
      setContentId(id);
    },
    [setContentId]
  );

  const closeContent = useCallback(() => {
    setContentId(undefined);
  }, [setContentId]);

  const value: InteractiveContentContextType = useMemo(
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
