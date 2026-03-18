import {
  VOICE_LANGUAGES,
  type VoiceGender,
  type VoiceLanguage,
  type VoiceUseCase,
} from "@app/lib/api/actions/servers/speech_generator/metadata";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import logger from "@app/logger/logger";
import { dustManagedServiceCredentials } from "@app/types/api/credentials";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Voice } from "@elevenlabs/elevenlabs-js/api/types";
import { ElevenLabsEnvironment } from "@elevenlabs/elevenlabs-js/environments";

interface VoiceDefinition {
  voiceId: string;
  name: string;
  gender: VoiceGender;
  languages: VoiceLanguage[];
  useCase: VoiceUseCase;
  score: number;
}

// Maps our VoiceLanguage identifiers to ElevenLabs locale prefixes used in
// verifiedLanguages[].locale (e.g. "en-US", "fr-FR").
const LANGUAGE_TO_LOCALE_PREFIX: Record<VoiceLanguage, string[]> = {
  english_american: ["en-US", "en"],
  english_british: ["en-GB", "en-UK"],
  french: ["fr"],
  german: ["de"],
  dutch: ["nl"],
  italian: ["it"],
  japanese: ["ja"],
  hindi: ["hi"],
  chinese: ["zh"],
  spanish: ["es"],
  portuguese: ["pt"],
  korean: ["ko"],
  arabic: ["ar"],
  turkish: ["tr"],
  polish: ["pl"],
  swedish: ["sv"],
  russian: ["ru"],
  indonesian: ["id"],
  filipino: ["fil", "tl"],
  thai: ["th"],
  vietnamese: ["vi"],
};

function matchesLanguage(
  locale: string | undefined,
  language: string | undefined,
  voiceLanguage: VoiceLanguage
): boolean {
  const prefixes = LANGUAGE_TO_LOCALE_PREFIX[voiceLanguage];
  if (locale) {
    return prefixes.some(
      (p) => locale === p || locale.startsWith(`${p}-`) || locale.startsWith(p)
    );
  }
  if (language) {
    const lc = language.toLowerCase();
    return prefixes.some(
      (p) => lc === p.toLowerCase() || lc.startsWith(p.toLowerCase())
    );
  }
  return false;
}

function extractLanguages(voice: Voice): VoiceLanguage[] {
  const languages = voice.verifiedLanguages;
  if (!languages || languages.length === 0) {
    return [];
  }
  const matched = new Set<VoiceLanguage>();
  for (const vl of languages) {
    for (const lang of VOICE_LANGUAGES) {
      if (matchesLanguage(vl.locale, vl.language, lang)) {
        matched.add(lang);
      }
    }
  }
  return [...matched];
}

function normalizeGender(labels: Record<string, string>): VoiceGender {
  const raw = (labels["gender"] ?? labels["Gender"] ?? "").toLowerCase();
  if (raw.includes("male") && !raw.includes("female")) {
    return "male";
  }
  return "female";
}

function inferUseCase(labels: Record<string, string>): VoiceUseCase {
  const raw = (
    labels["use case"] ??
    labels["use_case"] ??
    labels["Use Case"] ??
    ""
  ).toLowerCase();
  if (raw.match(/narrat|story|audiobook|documentary/)) {
    return "narrative_story";
  }
  if (raw.match(/charact|anime|animation|cartoon|acting/)) {
    return "characters_animation";
  }
  if (raw.match(/social|tiktok|instagram|influencer|shorts/)) {
    return "social_media";
  }
  if (raw.match(/tv|broadcast|film|cinema|entertainment/)) {
    return "entertainment_tv";
  }
  if (raw.match(/ad |ads|advert|commercial|promo/)) {
    return "advertisement";
  }
  if (raw.match(/educat|tutorial|lesson|course|informative|explainer/)) {
    return "informative_educational";
  }
  return "conversational";
}

function scoreVoice(voice: Voice): number {
  const category = (voice.category ?? "").toLowerCase();
  const labels = voice.labels ?? {};
  const featured = (labels["featured"] ?? "").toLowerCase();
  let score = 0;
  if (
    category.includes("high_quality") ||
    category.includes("professional") ||
    category.includes("premade")
  ) {
    score += 5;
  }
  if (featured === "true" || featured === "yes") {
    score += 3;
  }
  if (voice.previewUrl) {
    score += 2;
  }
  return score;
}

function toVoiceDefinition(voice: Voice): VoiceDefinition | undefined {
  const labels = voice.labels ?? {};
  const languages = extractLanguages(voice);
  if (languages.length === 0) {
    return undefined;
  }
  return {
    voiceId: voice.voiceId,
    name: voice.name ?? "",
    gender: normalizeGender(labels),
    languages,
    useCase: inferUseCase(labels),
    score: scoreVoice(voice),
  };
}

// In-memory cache for fetched voices. Refreshes every 6 hours.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cachedVoices: VoiceDefinition[] | null = null;
let cacheTimestampMs = 0;

async function fetchVoices(): Promise<VoiceDefinition[]> {
  const now = Date.now();
  if (cachedVoices && now - cacheTimestampMs < CACHE_TTL_MS) {
    return cachedVoices;
  }

  try {
    const client = getElevenLabsClient();
    const resp = await client.voices.getAll();
    const definitions = resp.voices
      .map(toVoiceDefinition)
      .filter((v): v is VoiceDefinition => v !== undefined);

    // Sort by score descending for deterministic best-first selection.
    definitions.sort(
      (a, b) => b.score - a.score || a.name.localeCompare(b.name)
    );

    cachedVoices = definitions;
    cacheTimestampMs = now;

    logger.info(
      { voiceCount: definitions.length },
      "Refreshed ElevenLabs voice cache."
    );

    return definitions;
  } catch (err) {
    logger.error({ err }, "Failed to fetch ElevenLabs voices, using cache.");
    // Return stale cache if available, otherwise empty.
    return cachedVoices ?? [];
  }
}

// Hardcoded fallbacks used when the API is unreachable and cache is empty.
const DEFAULT_GENDER_FALLBACK = {
  male: "JBFqnCBsd6RMkjVDRZzb", // George
  female: "cgSgspJ2msm6clMCkdW9", // Jessica
} as const;

function pickBest(candidates: VoiceDefinition[]): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  // Already sorted by score desc, so first match is best.
  return candidates[0].voiceId;
}

export async function resolveDefaultVoiceId({
  language,
  gender,
  useCase,
}: {
  language: VoiceLanguage;
  gender: VoiceGender;
  useCase: VoiceUseCase;
}): Promise<string> {
  const voices = await fetchVoices();

  // 1) language + useCase + gender
  let voiceId = pickBest(
    voices.filter(
      (v) =>
        v.languages.includes(language) &&
        v.useCase === useCase &&
        v.gender === gender
    )
  );
  if (voiceId) {
    return voiceId;
  }

  // 2) language + gender (relax use case)
  voiceId = pickBest(
    voices.filter((v) => v.languages.includes(language) && v.gender === gender)
  );
  if (voiceId) {
    return voiceId;
  }

  // 3) language only
  voiceId = pickBest(voices.filter((v) => v.languages.includes(language)));
  if (voiceId) {
    return voiceId;
  }

  // 4) gender only
  voiceId = pickBest(voices.filter((v) => v.gender === gender));
  if (voiceId) {
    return voiceId;
  }

  // 5) Final safety fallback.
  return DEFAULT_GENDER_FALLBACK[gender];
}

export function getElevenLabsClient() {
  const credentials = dustManagedServiceCredentials();
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
