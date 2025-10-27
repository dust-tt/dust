/**
 * Editor suggestion types and utilities.
 *
 * This file now uses the centralized mention module for filtering logic.
 * Type aliases are provided for backward compatibility.
 */

import type {
  RichAgentMention,
  RichMention,
  RichUserMention,
} from "@app/lib/mentions";
import { filterAgentSuggestions, isRichAgentMention } from "@app/lib/mentions";

// Type aliases for backward compatibility with existing code.
export type EditorSuggestionAgent = RichAgentMention;
export type EditorSuggestionUser = RichUserMention;
export type EditorSuggestion = RichMention;

export const isEditorSuggestionAgent = isRichAgentMention;

export interface EditorSuggestions {
  suggestions: EditorSuggestion[];
  fallbackSuggestions: EditorSuggestion[];
  isLoading: boolean;
}

// Re-export the filtering function from centralized module.
export const filterSuggestionAgents = filterAgentSuggestions;
