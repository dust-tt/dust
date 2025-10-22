import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { ElevenLabsEnvironment } from "@elevenlabs/elevenlabs-js/environments";

import { config as regionsConfig } from "@app/lib/api/regions/config";
import { dustManagedCredentials } from "@app/types";

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

interface VoiceDefinition {
  voiceId: string;
  name: string;
  gender: VoiceGender;
  languages: VoiceLanguage[];
  useCase: VoiceUseCase;
}

// Curated list of voices mapped from the provided JSON, restricted to our current
// VoiceLanguage union. We favor high-quality and broadly applicable options.
const VOICES: VoiceDefinition[] = [
  {
    voiceId: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    gender: "male",
    languages: ["english_british", "french", "japanese", "hindi"],
    useCase: "narrative_story",
  },
  {
    voiceId: "CwhRBWXzGAHq8TQ4Fs17",
    name: "Roger",
    gender: "male",
    languages: ["english_american", "french", "german", "dutch"],
    useCase: "conversational",
  },
  {
    voiceId: "2EiwWnXFnvU5JabPnv8n",
    name: "Clyde",
    gender: "male",
    languages: ["english_american"],
    useCase: "characters_animation",
  },
  {
    voiceId: "FGY2WhTYpPnrIDTdsKH5",
    name: "Laura",
    gender: "female",
    languages: ["english_american", "french", "chinese", "german"],
    useCase: "social_media",
  },
  {
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    gender: "female",
    languages: ["english_american", "french", "chinese", "hindi"],
    useCase: "entertainment_tv",
  },
  {
    voiceId: "Xb7hH8MSUJpSbSDYk0k2",
    name: "Alice",
    gender: "female",
    languages: ["english_british", "italian", "french", "japanese", "hindi"],
    useCase: "advertisement",
  },
  {
    voiceId: "XrExE9yKIg1WjnnlVkGX",
    name: "Matilda",
    gender: "female",
    languages: ["english_american", "italian", "french", "german"],
    useCase: "informative_educational",
  },
  {
    voiceId: "pFZP5JQG7iQjIQuC4Bku",
    name: "Lily",
    gender: "female",
    languages: ["english_american", "italian", "german", "chinese", "dutch"],
    useCase: "narrative_story",
  },
  {
    voiceId: "cgSgspJ2msm6clMCkdW9",
    name: "Jessica",
    gender: "female",
    languages: [
      "english_american",
      "french",
      "japanese",
      "chinese",
      "german",
      "hindi",
    ],
    useCase: "conversational",
  },
  {
    voiceId: "TX3LPaxmHKxFdv7VOQHJ",
    name: "Liam",
    gender: "male",
    languages: ["english_american", "german", "hindi"],
    useCase: "social_media",
  },
  {
    voiceId: "bIHbv24MWmeRgasZH58o",
    name: "Will",
    gender: "male",
    languages: ["english_american", "french", "german", "chinese"],
    useCase: "conversational",
  },
  {
    voiceId: "nPczCjzI2devNBz1zQrb",
    name: "Brian",
    gender: "male",
    languages: ["english_american", "chinese", "german", "dutch", "hindi"],
    useCase: "social_media",
  },
];

const DEFAULT_GENDER_FALLBACK = {
  male: "JBFqnCBsd6RMkjVDRZzb", // George
  female: "cgSgspJ2msm6clMCkdW9", // Jessica
} as const;

function pickBestCandidate(
  candidates: VoiceDefinition[]
): VoiceDefinition | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  // Prefer high_quality, then featured, then stable alphabetical by name for determinism.
  return candidates.slice().sort((a, b) => {
    return a.name.localeCompare(b.name);
  })[0];
}

export function resolveDefaultVoiceId({
  language,
  gender,
  useCase,
}: {
  language: VoiceLanguage;
  gender: VoiceGender;
  useCase: VoiceUseCase;
}): string {
  // 1) language + useCase + gender
  let candidates = VOICES.filter(
    (v) =>
      v.languages.includes(language) &&
      v.useCase === useCase &&
      v.gender === gender
  );
  let chosen = pickBestCandidate(candidates);
  if (chosen) {
    return chosen.voiceId;
  }

  // 2) language + useCase
  candidates = VOICES.filter(
    (v) => v.languages.includes(language) && v.useCase === useCase
  );
  chosen = pickBestCandidate(candidates);
  if (chosen) {
    return chosen.voiceId;
  }

  // 3) language + gender
  candidates = VOICES.filter(
    (v) => v.languages.includes(language) && v.gender === gender
  );
  chosen = pickBestCandidate(candidates);
  if (chosen) {
    return chosen.voiceId;
  }

  // 4) language only
  candidates = VOICES.filter((v) => v.languages.includes(language));
  chosen = pickBestCandidate(candidates);
  if (chosen) {
    return chosen.voiceId;
  }

  // 5) Final safety fallback to previous behavior.
  return DEFAULT_GENDER_FALLBACK[gender];
}

export function getElevenLabsClient() {
  const credentials = dustManagedCredentials();
  const environment =
    regionsConfig.getCurrentRegion() === "europe-west1"
      ? ElevenLabsEnvironment.ProductionEu
      : ElevenLabsEnvironment.ProductionUs;

  return new ElevenLabsClient({
    apiKey: credentials.ELEVENLABS_API_KEY,
    environment,
  });
}

export async function streamToBase64(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  // Convert a web ReadableStream to a base64 string.
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}
