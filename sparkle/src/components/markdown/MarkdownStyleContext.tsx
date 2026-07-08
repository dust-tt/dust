import { createContext, useContext } from "react";

interface MarkdownStyleContextType {
  textColor: string;
  forcedTextSize?: string;
  compactSpacing: boolean;
  canCopyQuotes: boolean;
}

export const MarkdownStyleContext = createContext<MarkdownStyleContextType>({
  textColor: "text-foreground",
  compactSpacing: false,
  canCopyQuotes: true,
});

export function useMarkdownStyle() {
  return useContext(MarkdownStyleContext);
}
