import type { Voice } from "@elevenlabs/elevenlabs-js/api/types";
import type { Logger } from "pino";

import type {
  VoiceGender,
  VoiceUseCase,
} from "@app/lib/actions/mcp_internal_actions/servers/elevenlabs/utils";
import { getElevenLabsClient } from "@app/lib/actions/mcp_internal_actions/servers/elevenlabs/utils";
import { makeScript } from "@app/scripts/helpers";

interface CandidateVoice {
  voiceId: string;
  name: string;
  gender: VoiceGender;
  languages: (string | undefined)[];
  useCase: VoiceUseCase;
  // Extra info used for selection/scoring (not emitted in the final array):
  _category?: string;
  _featured?: boolean;
  _score: number;
}

const TARGET_COUNT = 30;

const ALL_USE_CASES: VoiceUseCase[] = [
  "narrative_story",
  "conversational",
  "characters_animation",
  "social_media",
  "entertainment_tv",
  "advertisement",
  "informative_educational",
];

function normalizeGender(raw?: string): VoiceGender {
  if (!raw) {
    return "female";
  }
  const v = raw.toLowerCase();
  if (v.includes("female") || v === "f") {
    return "female";
  }
  if (v.includes("male") || v === "m") {
    return "male";
  }
  return "female";
}

function inferUseCase(
  labels: Record<string, string | undefined> | undefined,
  name?: string
): VoiceUseCase {
  const lcName = name?.toLowerCase() ?? "";
  const raw = (
    (labels &&
      (labels["use case"] ?? labels["use_case"] ?? labels["Use Case"])) ??
    ""
  )
    .toString()
    .toLowerCase();

  const bag = `${lcName} ${raw}`;
  if (bag.match(/narrat|story|audiobook|documentary/)) {
    return "narrative_story";
  }
  if (bag.match(/charact|anime|animation|cartoon|acting/)) {
    return "characters_animation";
  }
  if (bag.match(/social|tiktok|instagram|influencer|shorts/)) {
    return "social_media";
  }
  if (bag.match(/tv|broadcast|film|cinema|entertainment/)) {
    return "entertainment_tv";
  }
  if (bag.match(/ad |ads|advert|commercial|promo/)) {
    return "advertisement";
  }
  if (bag.match(/educat|tutorial|lesson|course|informative|explainer/)) {
    return "informative_educational";
  }
  return "conversational";
}

function scoreVoice(v: Voice): number {
  // Prefer professional/high_quality and featured, then preview availability, then name.
  const category = (v.category ?? "").toLowerCase();
  const labels = v.labels ?? {};
  const featured = (
    labels["featured"] ||
    labels["Featured"] ||
    ""
  ).toLowerCase();

  let score = 0;
  if (category.includes("high_quality") || category.includes("professional")) {
    score += 5;
  }
  if (featured === "true" || featured === "yes") {
    score += 3;
  }
  if (v.previewUrl) {
    score += 2;
  }
  // Small deterministic tie-breaker based on name.
  score += Math.min(
    2,
    Math.max(0, 2 - Math.floor((v.name ? v.name.length : 0) / 12))
  );
  return score;
}

function toCandidate(v: Voice): CandidateVoice | undefined {
  const labels = v.labels ?? {};
  const g = normalizeGender(labels["gender"] ?? labels["Gender"] ?? "");
  const langInfo = v.verifiedLanguages;
  const useCase = inferUseCase(labels, v.name);

  return {
    voiceId: v.voiceId,
    name: v.name ?? "",
    gender: g,
    languages: langInfo?.map((v) => v.locale) ?? [],
    useCase,
    _category: v.category,
    _featured:
      (labels["featured"] ?? labels["Featured"] ?? "")
        ?.toString()
        .toLowerCase() === "true",
    _score: scoreVoice(v),
  };
}

function stableSort<T>(arr: readonly T[], cmp: (a: T, b: T) => number): T[] {
  // Stable sort without mutating the input array.
  return arr
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const d = cmp(a.item, b.item);
      return d !== 0 ? d : a.idx - b.idx;
    })
    .map(({ item }) => item);
}

function selectDiverse(
  candidates: CandidateVoice[],
  target: number
): CandidateVoice[] {
  const byUseCase = new Map<VoiceUseCase, CandidateVoice[]>();
  for (const uc of ALL_USE_CASES) {
    byUseCase.set(uc, []);
  }
  for (const c of candidates) {
    const list = byUseCase.get(c.useCase);
    if (list) {
      byUseCase.set(c.useCase, [...list, c]);
    }
  }

  // Sort within each use case by score.
  for (const [uc, list] of byUseCase.entries()) {
    byUseCase.set(
      uc,
      stableSort(list, (a, b) => b._score - a._score)
    );
  }

  let picked: CandidateVoice[] = [];

  // one per use case if available.
  for (const uc of ALL_USE_CASES) {
    const list = byUseCase.get(uc) ?? [];
    if (list.length > 0 && picked.length < target) {
      picked = [...picked, list[0]];
    }
  }

  // per-language gender coverage (aim for one male and one female per language where
  // possible).
  const byLanguage = new Map<string | undefined, CandidateVoice[]>();
  for (const c of candidates) {
    for (const lang of c.languages) {
      const arr = byLanguage.get(lang) ?? [];
      byLanguage.set(lang, [...arr, c]);
    }
  }
  for (const [_, list] of byLanguage.entries()) {
    const sorted = stableSort(list, (a, b) => b._score - a._score);
    const topFemale = sorted.find((c) => c.gender === "female");
    const topMale = sorted.find((c) => c.gender === "male");
    for (const c of [topFemale, topMale]) {
      if (
        c &&
        picked.length < target &&
        !picked.some((p) => p.voiceId === c.voiceId)
      ) {
        picked = [...picked, c];
      }
    }
  }

  return picked.slice(0, target);
}

function tsArray(selected: CandidateVoice[]) {
  // Emit as a ready-to-paste TypeScript array matching the `VoiceDefinition` structure.
  const lines: string[] = [];
  lines.push("const VOICES: VoiceDefinition[] = [");
  for (const v of selected) {
    lines.push(JSON.stringify(v, null, 2));
  }
  lines.push("];");

  return lines.join("\n");
}

async function getElevenLabsVoices(logger: Logger) {
  const client = getElevenLabsClient();

  const resp = await client.voices.getAll();
  const voices = resp.voices;
  const candidates = voices
    .map(toCandidate)
    .filter((v): v is CandidateVoice => Boolean(v));

  if (candidates.length === 0) {
    logger.error("No voices found from ElevenLabs.");
    return;
  }

  const selected = selectDiverse(candidates, TARGET_COUNT);

  logger.info(tsArray(selected));
}

makeScript({}, async (_, logger) => {
  await getElevenLabsVoices(logger);
});
