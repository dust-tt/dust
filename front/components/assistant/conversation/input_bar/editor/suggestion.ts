/**
 * Editor suggestion types and utilities.
 *
 * This file now uses the centralized mention module for filtering logic.
 * Type aliases are provided for backward compatibility.
 */

import { filterAgentSuggestions } from "@app/lib/mentions/editor/suggestion";
import type {
  RichAgentMention,
  RichMention,
  RichUserMention,
} from "@app/types";
import { isRichAgentMention } from "@app/types";

// TODO(rcs): remove those aliases
export type EditorSuggestionAgent = RichAgentMention;
export type EditorSuggestionUser = RichUserMention;
export type EditorSuggestion = RichMention;

// TODO(rcs): remove this aliases
export const isEditorSuggestionAgent = isRichAgentMention;

export interface EditorSuggestions {
  suggestions: EditorSuggestion[];
  fallbackSuggestions: EditorSuggestion[];
  isLoading: boolean;
}

// TODO(rcs): remove this aliases
export const filterSuggestionAgents = filterAgentSuggestions;
