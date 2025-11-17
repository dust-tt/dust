import type {
  BuilderEmojiSuggestionsType,
  BuilderTextSuggestionsType,
} from "@app/types";

export type SuggestionResults = {
  status: "ok";
} & (
  | BuilderEmojiSuggestionsType
  | {
      suggestions: BuilderTextSuggestionsType;
    }
);
