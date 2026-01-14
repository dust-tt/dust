// =============================================================================
// Voice Constants - Exported for use by servers and metadata files
// =============================================================================

// Defined here to avoid circular dependencies and allow client-side imports
export const VOICE_GENDERS = ["female", "male"] as const;

export type VoiceGender = (typeof VOICE_GENDERS)[number];

export const VOICE_LANGUAGES = [
  "english_american",
  "english_british",
  "french",
  "german",
  "dutch",
  "italian",
  "japanese",
  "hindi",
  "chinese",
] as const;

export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export const VOICE_USE_CASES = [
  "narrative_story",
  "conversational",
  "characters_animation",
  "social_media",
  "entertainment_tv",
  "advertisement",
  "informative_educational",
] as const;

export type VoiceUseCase = (typeof VOICE_USE_CASES)[number];
