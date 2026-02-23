import type {
  BuilderEmojiSuggestionsType,
  BuilderTextSuggestionsType,
} from "@app/types/api/internal/assistant";

export type SuggestionResults = {
  status: "ok";
} & (
  | BuilderEmojiSuggestionsType
  | {
      suggestions: BuilderTextSuggestionsType;
    }
);
