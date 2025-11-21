import type { RichMention } from "@app/types";

export interface EditorSuggestions {
  suggestions: RichMention[];
  fallbackSuggestions: RichMention[];
  isLoading: boolean;
  workspaceId: string;
  conversationId: string | null;
}
