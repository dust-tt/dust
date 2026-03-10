import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export interface SidekickHighlightContextType {
  highlightedSuggestionId: string | null;
  isHighlightedSuggestionPinned: boolean;
  highlightSuggestion: (id: string | null, pinned?: boolean) => void;
}

export const SidekickHighlightContext = createContext<
  SidekickHighlightContextType | undefined
>(undefined);

export const useSidekickHighlight = () => {
  const context = useContext(SidekickHighlightContext);
  if (!context) {
    throw new Error(
      "useSidekickHighlight must be used within a SidekickHighlightProvider"
    );
  }
  return context;
};

interface SidekickHighlightProviderProps {
  children: ReactNode;
}

export const SidekickHighlightProvider = ({
  children,
}: SidekickHighlightProviderProps) => {
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
    <SidekickHighlightContext.Provider value={value}>
      {children}
    </SidekickHighlightContext.Provider>
  );
};
