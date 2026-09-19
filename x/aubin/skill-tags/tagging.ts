import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { SkillsSnapshotType, TaggingInput, TaggingInputOptions } from "./data";
import { buildTaggingInput, saveJson } from "./data";
import {
  CONFIDENCE_LEVELS,
  FACETS,
  TAXONOMY_VERSION,
  taxonomyHash,
} from "./taxonomy";

export const Effort = z.enum(["low", "medium", "high", "xhigh", "max"]);
export type EffortLevel = z.infer<typeof Effort>;

const Usage = z.object({
  inputTokens: z.number().int().nonnegative(),
  cacheReadInputTokens: z.number().int().nonnegative(),
  cacheCreationInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export type UsageType = z.infer<typeof Usage>;

export const TagEntry = z.object({
  inputHash: z.string(),
  nameShown: z.string(),
  truncated: z.boolean(),
  // Model that produced the answer: the requested model, or the fallback after a refusal.
  servedBy: z.string(),
  tags: z.record(z.string(), z.array(z.string())),
  summary: z.string(),
  uncoveredAspects: z.array(z.string()),
  confidence: z.enum(CONFIDENCE_LEVELS),
  attempts: z.number().int().positive(),
  usage: Usage,
  createdAt: z.string(),
});
export type TagEntryType = z.infer<typeof TagEntry>;

export const TagsFile = z.object({
  version: z.literal(1),
  workspace: z.string(),
  model: z.string(),
  effort: Effort,
  promptHash: z.string(),
  taxonomyVersion: z.number().int(),
  taxonomyHash: z.string(),
  maskNamePrefix: z.boolean(),
  instructionTokenBudget: z.number().int().positive(),
  createdAt: z.string(),
  entries: z.record(z.string(), TagEntry),
});
export type TagsFileType = z.infer<typeof TagsFile>;

export const StabilityFile = z.object({
  version: z.literal(1),
  seed: z.number().int(),
  sampleIds: z.array(z.string()),
  model: z.string(),
  effort: Effort,
  promptHash: z.string(),
  taxonomyHash: z.string(),
  createdAt: z.string(),
  entries: z.record(z.string(), TagEntry),
});
export type StabilityFileType = z.infer<typeof StabilityFile>;

export type TaggerConfig = {
  model: string;
  effort: EffortLevel;
  inputOptions: TaggingInputOptions;
};

// Safety classifiers on the primary model may decline a skill (for example a pentest runbook);
// the API then re-runs the same request on this model inside the same call.
export const FALLBACK_MODEL = "claude-opus-4-8";

/**
 * @cc [owner:aubin-tchoi,label:mcp] tagger-output-closed-enums
 * The structured output schema sent to the model must enumerate, per facet, exactly the tag IDs of
 * `FACETS`, so the model cannot return a tag outside the taxonomy. Cardinality is checked after
 * parsing, not by the schema.
 */
export const TaggerOutput = z.object({
  tags: z.object(
    Object.fromEntries(
      FACETS.map((facet) => [
        facet.id,
        z
          .array(z.enum(facet.tags.map((tag) => tag.id)))
          .describe(
            `${facet.min}-${facet.max} tag IDs from the ${facet.id} facet, most important first.`,
          ),
      ]),
    ),
  ),
  summary: z
    .string()
    .describe("One sentence of at most 25 words stating the skill's purpose and deliverable."),
  uncoveredAspects: z
    .array(z.string())
    .describe(
      "Up to 3 short lowercase keywords for important aspects of the purpose that no tag expresses. Empty when the tags suffice.",
    ),
  confidence: z
    .enum(CONFIDENCE_LEVELS)
    .describe("Confidence that the function and subject tags are right."),
});
export type TaggerOutputType = z.infer<typeof TaggerOutput>;

// The model's JSON is parsed leniently so that an out-of-vocabulary tag or a wrong confidence
// becomes a reported violation with a corrective retry instead of a parse failure.
const LenientOutput = z.object({
  tags: z.record(z.string(), z.array(z.string())),
  summary: z.string(),
  uncoveredAspects: z.array(z.string()),
  confidence: z.string(),
});
type LenientOutputType = z.infer<typeof LenientOutput>;

export function buildSystemPrompt(): string {
  const facets = FACETS.map((facet) =>
    [
      `## ${facet.id} (${facet.min}-${facet.max} tags)`,
      facet.description,
      ...facet.tags.map((tag) => `- ${tag.id}: ${tag.description}`),
    ].join("\n"),
  ).join("\n\n");
  return [
    "You classify internal AI agent skills from one company workspace into a fixed taxonomy. The tags power a similarity search: two skills with the same purpose and objective must receive the same tags, and skills with different purposes must differ on at least one of the function, task, or subject facets.",
    "Judge each skill by what it is for, who it is for, and what it produces, based on its name, description, enabled tools, and instructions. Ignore wording, formatting, and length. Tag the skill, not the example prompts it quotes.",
    "Return one tag list per facet using only the tag IDs listed below, most important first, within the stated bounds.",
    facets,
    [
      "## Rules",
      "- Prefer the most specific tag. Use general and other only when nothing else fits.",
      "- A skill written for one named person is self-personal; its function is what that person uses it for.",
      "- reference-knowledge is for skills that mainly supply context or rules rather than perform an action.",
      "- systems lists only systems the skill reads or writes while running. Enabled tools count as evidence; a system merely mentioned as an example does not.",
      "- quality is test-placeholder for test or junk skills and thin for a real intent with almost no instructions. Tag test-placeholder skills on their nominal purpose otherwise, with output chat-answer when nothing else applies.",
      "- summary is one sentence of at most 25 words.",
      "- uncoveredAspects has at most 3 short lowercase keywords and is empty when the tags capture the purpose.",
    ].join("\n"),
  ].join("\n\n");
}

export function promptHash(systemPrompt: string): string {
  return createHash("sha256").update(systemPrompt).digest("hex");
}

export function cardinalityViolations(
  tags: Record<string, string[]>,
): string[] {
  const violations: string[] = [];
  for (const facet of FACETS) {
    const values = tags[facet.id];
    if (!values) {
      violations.push(`${facet.id}: missing`);
      continue;
    }
    if (new Set(values).size !== values.length) {
      violations.push(`${facet.id}: duplicate tags`);
    }
    if (values.length < facet.min || values.length > facet.max) {
      violations.push(
        `${facet.id}: ${values.length} tags, expected ${facet.min}-${facet.max}`,
      );
    }
    const allowed = new Set(facet.tags.map((tag) => tag.id));
    for (const value of values) {
      if (!allowed.has(value)) {
        violations.push(`${facet.id}: unknown tag ${value}`);
      }
    }
  }
  return violations;
}

function outputViolations(output: LenientOutputType): string[] {
  const violations = cardinalityViolations(output.tags);
  if (output.summary.trim().length === 0) {
    violations.push("summary: empty");
  }
  if (!CONFIDENCE_LEVELS.includes(output.confidence)) {
    violations.push(`confidence: unknown level ${output.confidence}`);
  }
  if (output.uncoveredAspects.length > 3) {
    violations.push(`uncoveredAspects: ${output.uncoveredAspects.length} keywords, expected at most 3`);
  }
  return violations;
}

/**
 * @cc [owner:aubin-tchoi,label:product] tag-one-skill-validated
 * A returned entry must satisfy every facet's cardinality and contain only taxonomy tag IDs. One
 * corrective retry is allowed when the first answer violates those bounds; a second violation, a
 * non `end_turn` stop reason, or an unparseable answer must throw instead of returning an entry.
 * A refusal by the requested model is retried server-side on `FALLBACK_MODEL`; the entry records
 * the model that answered in `servedBy`.
 */
export async function tagSkill(
  client: Anthropic,
  config: TaggerConfig,
  systemPrompt: string,
  input: TaggingInput,
): Promise<TagEntryType> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: input.text },
  ];
  const usage: UsageType = {
    inputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    outputTokens: 0,
  };
  let violations: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.beta.messages.create({
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: config.model === FALLBACK_MODEL ? null : [{ model: FALLBACK_MODEL }],
      model: config.model,
      max_tokens: 8192,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
      output_config: {
        format: betaZodOutputFormat(TaggerOutput),
        effort: config.effort,
      },
    });
    usage.inputTokens += response.usage.input_tokens;
    usage.cacheReadInputTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheCreationInputTokens +=
      response.usage.cache_creation_input_tokens ?? 0;
    usage.outputTokens += response.usage.output_tokens;
    if (response.stop_reason !== "end_turn") {
      throw new Error(
        `Model stopped with ${response.stop_reason ?? "unknown"} for skill ${input.id}.`,
      );
    }
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    const parsed = LenientOutput.parse(JSON.parse(text));
    violations = outputViolations(parsed);
    if (violations.length === 0) {
      return {
        inputHash: input.inputHash,
        nameShown: input.nameShown,
        truncated: input.truncated,
        servedBy: response.model,
        tags: parsed.tags,
        summary: parsed.summary.trim(),
        uncoveredAspects: parsed.uncoveredAspects.map((keyword) =>
          keyword.trim().toLowerCase(),
        ),
        confidence: parsed.confidence,
        attempts: attempt,
        usage,
        createdAt: new Date().toISOString(),
      };
    }
    messages.push(
      { role: "assistant", content: JSON.stringify(parsed) },
      {
        role: "user",
        content: `Your answer violated these constraints:\n${violations
          .map((violation) => `- ${violation}`)
          .join("\n")}\nReturn a corrected answer that respects every facet's bounds.`,
      },
    );
  }
  throw new Error(
    `Skill ${input.id} still violates constraints after retry: ${violations.join("; ")}`,
  );
}

export async function readTagsFile(path: string): Promise<TagsFileType> {
  const raw = await readFile(path, "utf8");
  const file = TagsFile.parse(JSON.parse(raw));
  for (const [id, entry] of Object.entries(file.entries)) {
    const violations = cardinalityViolations(entry.tags);
    if (violations.length > 0) {
      throw new Error(`Saved tags for ${id} are invalid: ${violations.join("; ")}`);
    }
  }
  return file;
}

export async function readStabilityFile(path: string): Promise<StabilityFileType> {
  const raw = await readFile(path, "utf8");
  return StabilityFile.parse(JSON.parse(raw));
}

export function emptyTagsFile(
  snapshot: SkillsSnapshotType,
  config: TaggerConfig,
  systemPrompt: string,
): TagsFileType {
  return {
    version: 1,
    workspace: snapshot.workspace,
    model: config.model,
    effort: config.effort,
    promptHash: promptHash(systemPrompt),
    taxonomyVersion: TAXONOMY_VERSION,
    taxonomyHash: taxonomyHash(),
    maskNamePrefix: config.inputOptions.maskNamePrefix,
    instructionTokenBudget: config.inputOptions.instructionTokenBudget,
    createdAt: new Date().toISOString(),
    entries: {},
  };
}

/**
 * @cc [owner:aubin-tchoi,label:product] tags-reuse-requires-identical-setup
 * Saved tags may be reused only when workspace, model, effort, prompt hash, taxonomy hash, name
 * masking, and instruction budget all match the current run, and per skill only when the input
 * hash matches. Any file-level mismatch must throw and point to a different `--out` directory
 * rather than overwriting or mixing tags produced under different settings.
 */
export function assertReusable(existing: TagsFileType, expected: TagsFileType): void {
  const fields: (keyof TagsFileType)[] = [
    "workspace",
    "model",
    "effort",
    "promptHash",
    "taxonomyHash",
    "maskNamePrefix",
    "instructionTokenBudget",
  ];
  const mismatched = fields.filter((field) => existing[field] !== expected[field]);
  if (mismatched.length > 0) {
    throw new Error(
      `Existing tags.json was produced with different ${mismatched.join(", ")}. Use another --out directory to keep both snapshots.`,
    );
  }
}

type PoolTask<T> = () => Promise<T>;

// After a failure no new task starts, but in-flight tasks finish and checkpoint; every failure
// is then reported at once so the operator sees each failing skill.
async function runPool<T>(tasks: PoolTask<T>[], concurrency: number): Promise<T[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer.");
  }
  const results: T[] = [];
  const failures: unknown[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length && failures.length === 0) {
      const index = next++;
      try {
        results[index] = await tasks[index]();
      } catch (error) {
        failures.push(error);
      }
    }
  });
  await Promise.all(workers);
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      failures
        .map((failure) => (failure instanceof Error ? failure.message : "Unexpected failure"))
        .join(" | "),
    );
  }
  return results;
}

/**
 * @cc [owner:aubin-tchoi,label:cli] tags-checkpoint-per-skill
 * `tags.json` must be written before the first model call and again after every completed skill,
 * so an interrupted run loses at most the in-flight requests. Writes must be serialized so a
 * later checkpoint never overwrites a newer one with older content.
 */
export async function tagSkills(params: {
  snapshot: SkillsSnapshotType;
  path: string;
  existing: TagsFileType | null;
  client: Anthropic;
  config: TaggerConfig;
  concurrency: number;
  limit: number | null;
  progress: (complete: number, total: number, id: string) => void;
}): Promise<TagsFileType> {
  const { snapshot, path, existing, client, config, concurrency, limit, progress } =
    params;
  const systemPrompt = buildSystemPrompt();
  const file = emptyTagsFile(snapshot, config, systemPrompt);
  const inputs = snapshot.skills.map((skill) =>
    buildTaggingInput(skill, config.inputOptions),
  );
  if (existing) {
    assertReusable(existing, file);
    file.createdAt = existing.createdAt;
    for (const input of inputs) {
      const entry = existing.entries[input.id];
      if (entry && entry.inputHash === input.inputHash) {
        file.entries[input.id] = entry;
      }
    }
  }
  const pending = inputs.filter((input) => !file.entries[input.id]);
  const selected = limit === null ? pending : pending.slice(0, limit);
  let saving = saveJson(path, file);
  const total = Object.keys(file.entries).length + selected.length;
  await runPool(
    selected.map((input) => async () => {
      const entry = await tagSkill(client, config, systemPrompt, input);
      file.entries[input.id] = entry;
      saving = saving.then(() => saveJson(path, file));
      await saving;
      progress(Object.keys(file.entries).length, total, input.id);
    }),
    concurrency,
  );
  await saving;
  return file;
}

/**
 * @cc [owner:aubin-tchoi,label:cli] stability-checkpoint-per-skill
 * `stability.json` must be written before the first model call and after every re-tagged skill.
 * An existing file is resumed only when its seed, sample, model, effort, prompt hash, and
 * taxonomy hash match; otherwise it is replaced.
 */
export async function retagSample(params: {
  snapshot: SkillsSnapshotType;
  tags: TagsFileType;
  sampleIds: string[];
  seed: number;
  existing: StabilityFileType | null;
  client: Anthropic;
  concurrency: number;
  path: string;
  progress: (complete: number, total: number, id: string) => void;
}): Promise<StabilityFileType> {
  const { snapshot, tags, sampleIds, seed, existing, client, concurrency, path, progress } =
    params;
  const config: TaggerConfig = {
    model: tags.model,
    effort: tags.effort,
    inputOptions: {
      maskNamePrefix: tags.maskNamePrefix,
      instructionTokenBudget: tags.instructionTokenBudget,
    },
  };
  const systemPrompt = buildSystemPrompt();
  if (promptHash(systemPrompt) !== tags.promptHash || taxonomyHash() !== tags.taxonomyHash) {
    throw new Error("The prompt or taxonomy changed since tags.json was produced. Retag first.");
  }
  const byId = new Map(snapshot.skills.map((skill) => [skill.id, skill]));
  const file: StabilityFileType = {
    version: 1,
    seed,
    sampleIds,
    model: tags.model,
    effort: tags.effort,
    promptHash: tags.promptHash,
    taxonomyHash: tags.taxonomyHash,
    createdAt: new Date().toISOString(),
    entries: {},
  };
  if (
    existing &&
    existing.seed === seed &&
    existing.sampleIds.join() === sampleIds.join() &&
    existing.model === file.model &&
    existing.effort === file.effort &&
    existing.promptHash === file.promptHash &&
    existing.taxonomyHash === file.taxonomyHash
  ) {
    file.createdAt = existing.createdAt;
    file.entries = { ...existing.entries };
  }
  const pending = sampleIds.filter((id) => !file.entries[id]);
  let saving = saveJson(path, file);
  await runPool(
    pending.map((id) => async () => {
      const skill = byId.get(id);
      if (!skill) {
        throw new Error(`Sample skill ${id} is not in the snapshot.`);
      }
      const entry = await tagSkill(
        client,
        config,
        systemPrompt,
        buildTaggingInput(skill, config.inputOptions),
      );
      file.entries[id] = entry;
      saving = saving.then(() => saveJson(path, file));
      await saving;
      progress(Object.keys(file.entries).length, sampleIds.length, id);
    }),
    concurrency,
  );
  await saving;
  return file;
}
