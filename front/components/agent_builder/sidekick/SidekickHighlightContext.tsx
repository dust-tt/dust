import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export interface CopilotHighlightContextType {
  highlightedSuggestionId: string | null;
  isHighlightedSuggestionPinned: boolean;
  highlightSuggestion: (id: string | null, pinned?: boolean) => void;
}

export const CopilotHighlightContext = createContext<
  CopilotHighlightContextType | undefined
>(undefined);

export const useCopilotHighlight = () => {
  const context = useContext(CopilotHighlightContext);
  if (!context) {
    throw new Error(
      "useCopilotHighlight must be used within a CopilotHighlightProvider"
    );
  }
  return context;
};

interface CopilotHighlightProviderProps {
  children: ReactNode;
}

export const CopilotHighlightProvider = ({
  children,
}: CopilotHighlightProviderProps) => {
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<
    string | null
  >(null);
  const [isHighlightedSuggestionPinned, setIsHighlightedSuggestionPinned] =
    useState(false);

  const highlightSuggestion = useCallback(
    (id: string | null, pinned?: boolean) => {
      setHighlightedSuggestionId(id);
      setIsHighlightedSuggestionPinned(pinned ?? false);
    },
    []
  );

  const value = useMemo(
    () => ({
      highlightedSuggestionId,
      isHighlightedSuggestionPinned,
      highlightSuggestion,
    }),
    [
      highlightedSuggestionId,
      isHighlightedSuggestionPinned,
      highlightSuggestion,
    ]
  );

  return (
    <CopilotHighlightContext.Provider value={value}>
      {children}
    </CopilotHighlightContext.Provider>
  );
};
