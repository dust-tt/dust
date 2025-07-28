import type { ReactNode } from "react";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface PreviewPanelContextType {
  isPreviewPanelOpen: boolean;
  setIsPreviewPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const PreviewPanelContext = createContext<PreviewPanelContextType | undefined>(
  undefined
);

export const usePreviewPanelContext = () => {
  const context = useContext(PreviewPanelContext);
  if (!context) {
    throw new Error(
      "usePreviewPanelContext must be used within a PreviewPanelProvider"
    );
  }
  return context;
};

interface PreviewPanelProviderProps {
  children: ReactNode;
}

export const PreviewPanelProvider = ({
  children,
}: PreviewPanelProviderProps) => {
  const [isPreviewPanelOpen, setIsPreviewPanelOpen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const handleMediaChange = (event: MediaQueryListEvent) => {
      setIsPreviewPanelOpen(event.matches);
    };

    mediaQuery.addEventListener("change", handleMediaChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);

  const value: PreviewPanelContextType = useMemo(
    () => ({
      isPreviewPanelOpen,
      setIsPreviewPanelOpen,
    }),
    [isPreviewPanelOpen, setIsPreviewPanelOpen]
  );

  return (
    <PreviewPanelContext.Provider value={value}>
      {children}
    </PreviewPanelContext.Provider>
  );
};

PreviewPanelProvider.displayName = "PreviewPanelProvider";
