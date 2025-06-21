import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface PreviewPanelContextType {
  isPreviewPanelOpen: boolean;
  setIsPreviewPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const PreviewPanelContext = createContext<PreviewPanelContextType>({
  isPreviewPanelOpen: false,
  setIsPreviewPanelOpen: () => {},
});

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

export const PreviewPanelProvider = memo(
  ({ children }: PreviewPanelProviderProps) => {
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

    const value: PreviewPanelContextType = {
      isPreviewPanelOpen,
      setIsPreviewPanelOpen,
    };

    return (
      <PreviewPanelContext.Provider value={value}>
        {children}
      </PreviewPanelContext.Provider>
    );
  }
);

PreviewPanelProvider.displayName = "PreviewPanelProvider";
