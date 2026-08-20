import { createContext, useContext } from "react";

interface MarkdownStyleContextType {
  textColor: string;
  forcedTextSize?: string;
  compactSpacing: boolean;
  canCopyQuotes: boolean;
}

/**
 * Provides shared typography and behavior options (`textColor`,
 * `forcedTextSize`, `compactSpacing`, `canCopyQuotes`) to every renderer block,
 * so style changes bypass the blocks' position-based memoization.
 * @summary Context providing Markdown typography options.
 */
export const MarkdownStyleContext = createContext<MarkdownStyleContextType>({
  textColor: "text-foreground",
  compactSpacing: false,
  canCopyQuotes: true,
});

/**
 * Provides the current MarkdownStyleContext value — the typography and
 * behavior options set by the enclosing Markdown component.
 * @summary Hook reading the Markdown style context.
 */
export function useMarkdownStyle() {
  return useContext(MarkdownStyleContext);
}
