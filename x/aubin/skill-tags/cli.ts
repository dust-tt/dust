import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import logger from "../../../front/logger/logger";
import { EnvironmentConfig } from "../../../front/types/shared/utils/config";
import { fetchSkills } from "../skill-embeddings/cli";
import { readEmbeddings } from "../skill-embeddings/data";
import type { SkillsSnapshotType } from "./data";
import {
  readSnapshot,
  saveJson,
  snapshotFromEmbeddings,
  snapshotFromPayload,
} from "./data";
import type { EmbeddingReference, Metrics } from "./metrics";
import { computeMetrics, referenceCosines, toEmbeddingReference } from "./metrics";
import { shuffled } from "./similarity";
import type { TagsFileType } from "./tagging";
import {
  Effort,
  readStabilityFile,
  readTagsFile,
  retagSample,
  tagSkills,
} from "./tagging";
import { FACETS, TAXONOMY_VERSION, taxonomyHash } from "./taxonomy";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const HELP = `Skill tagging experiment

Commands:
  snapshot   Save skills.json from a saved embeddings.json, a skills API response, or the API
  tag        Tag every snapshot skill with the taxonomy (resumable, checkpointed per skill)
  stability  Re-tag a seeded sample of skills and save stability.json
  evaluate   Compute metrics.json, using an embeddings.json as semantic reference when available
  report     Build the offline index.html report
  run        snapshot (when missing), tag, stability, evaluate, and report in sequence

Examples:
  node --import tsx x/aubin/skill-tags/cli.ts run --from-embeddings path/to/embeddings.json
  node --import tsx x/aubin/skill-tags/cli.ts tag --workspace WORKSPACE_ID --limit 20
  node --import tsx x/aubin/skill-tags/cli.ts evaluate --out output/WORKSPACE_ID

Options:
  --out DIRECTORY          Default x/aubin/skill-tags/output/WORKSPACE_ID
  --workspace ID           Workspace string ID (locates the default --out; required for API fetch)
  --from-embeddings FILE   Build the snapshot from a skill-embeddings embeddings.json
  --input FILE             Build the snapshot from a saved public skills API response
  --dust-url URL           Dust origin for API fetch, default https://dust.tt
  --status STATUS          active (default), archived, or suggested
  --include-unpublished   Include editor-only skills (admin API key)
  --model MODEL            Tagging model, default claude-opus-5
  --effort LEVEL           low, medium (default), high, xhigh, or max
  --concurrency N          Parallel model requests, default 4
  --limit N                Tag at most N pending skills (smoke tests)
  --instruction-budget N   Max cl100k tokens of instructions per skill, default 6000
  --keep-name-prefix       Show bracketed team labels like "[GTM]" to the model
  --sample N               Stability sample size, default 40; 0 skips the stage
  --seed N                 Seed for sampling and bootstraps, default 42
  --embeddings FILE        Semantic reference for evaluate; defaults to the snapshot source
  --help                   Show this help

Credentials: ANTHROPIC_API_KEY for tagging, DUST_API_KEY for API fetch.
`;

type Options = {
  out: string | undefined;
  workspace: string | undefined;
  fromEmbeddings: string | undefined;
  input: string | undefined;
  dustUrl: string;
  status: string;
  includeUnpublished: boolean;
  model: string;
  effort: string;
  concurrency: string;
  limit: string | undefined;
  instructionBudget: string;
  keepNamePrefix: boolean;
  sample: string;
  seed: string;
  embeddings: string | undefined;
};

const positiveInt = z.coerce.number().int().min(1);
const nonNegativeInt = z.coerce.number().int().min(0);

const CosinesFile = z.object({
  version: z.literal(1),
  model: z.string(),
  ids: z.array(z.string()),
  values: z.array(z.number()),
});

function anthropicClient(): Anthropic {
  const key = EnvironmentConfig.getOptionalEnvVariable("ANTHROPIC_API_KEY");
  if (!key) {
    throw new Error("Set ANTHROPIC_API_KEY to tag skills.");
  }
  return new Anthropic({ apiKey: key, timeout: 120_000, maxRetries: 5 });
}

function outDirectory(options: Options, workspace: string): string {
  return resolve(options.out ?? resolve(HERE, "output", workspace));
}

async function loadSnapshot(options: Options): Promise<{ snapshot: SkillsSnapshotType; out: string }> {
  if (options.out) {
    const snapshot = await readSnapshot(resolve(options.out, "skills.json"));
    return { snapshot, out: resolve(options.out) };
  }
  const workspace = z.string().min(1, "Provide --out or --workspace").parse(options.workspace);
  const out = outDirectory(options, workspace);
  return { snapshot: await readSnapshot(resolve(out, "skills.json")), out };
}

async function snapshot(options: Options): Promise<{ snapshot: SkillsSnapshotType; out: string }> {
  let result: SkillsSnapshotType;
  if (options.fromEmbeddings) {
    result = await snapshotFromEmbeddings(resolve(options.fromEmbeddings));
  } else {
    const workspace = z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/, "Provide a workspace string ID with --workspace")
      .parse(options.workspace);
    const status = z.enum(["active", "archived", "suggested"]).parse(options.status);
    if (options.input) {
      const payload: unknown = JSON.parse(await readFile(resolve(options.input), "utf8"));
      result = snapshotFromPayload(payload, workspace, {
        kind: "input-file",
        path: resolve(options.input),
      });
    } else {
      const key = EnvironmentConfig.getOptionalEnvVariable("DUST_API_KEY");
      if (!key) {
        throw new Error("Set DUST_API_KEY to fetch workspace skills.");
      }
      const origin = new URL(options.dustUrl).origin;
      const payload: unknown = await fetchSkills(
        origin,
        workspace,
        status,
        options.includeUnpublished,
        key,
      );
      result = snapshotFromPayload(payload, workspace, {
        kind: "api",
        dustUrl: origin,
        status,
        includeUnpublished: options.includeUnpublished,
      });
    }
  }
  const out = outDirectory(options, result.workspace);
  const path = resolve(out, "skills.json");
  if (existsSync(path)) {
    const existing = await readSnapshot(path);
    const changed = result.skills.filter((skill) => {
      const previous = existing.skills.find((candidate) => candidate.id === skill.id);
      return !previous || previous.textHash !== skill.textHash;
    }).length;
    logger.info(
      { skills: result.skills.length, previous: existing.skills.length, changed },
      "Replacing existing skills.json",
    );
  }
  await saveJson(path, result);
  await saveJson(resolve(out, "taxonomy.json"), {
    version: TAXONOMY_VERSION,
    hash: taxonomyHash(),
    facets: FACETS,
  });
  logger.info(
    { skills: result.skills.length, workspace: result.workspace, out },
    "Saved skills snapshot and taxonomy",
  );
  return { snapshot: result, out };
}

async function tag(
  options: Options,
  loaded: { snapshot: SkillsSnapshotType; out: string },
): Promise<TagsFileType> {
  const path = resolve(loaded.out, "tags.json");
  const existing = existsSync(path) ? await readTagsFile(path) : null;
  const config = {
    model: z.string().min(1).parse(options.model),
    effort: Effort.parse(options.effort),
    inputOptions: {
      maskNamePrefix: !options.keepNamePrefix,
      instructionTokenBudget: positiveInt.parse(options.instructionBudget),
    },
  };
  const limit = options.limit === undefined ? null : positiveInt.parse(options.limit);
  logger.info(
    {
      skills: loaded.snapshot.skills.length,
      cached: existing ? Object.keys(existing.entries).length : 0,
      model: config.model,
      effort: config.effort,
      limit,
    },
    "Tagging skills",
  );
  const tags = await tagSkills({
    snapshot: loaded.snapshot,
    path,
    existing,
    client: anthropicClient(),
    config,
    concurrency: positiveInt.parse(options.concurrency),
    limit,
    progress: (complete, total, id) =>
      logger.info({ complete, total, id }, "Saved tag checkpoint"),
  });
  logger.info({ tagged: Object.keys(tags.entries).length, path }, "Tagging complete");
  return tags;
}

async function stability(
  options: Options,
  loaded: { snapshot: SkillsSnapshotType; out: string },
): Promise<void> {
  const sampleSize = nonNegativeInt.parse(options.sample);
  if (sampleSize === 0) {
    logger.info("Skipping stability stage (--sample 0)");
    return;
  }
  const tags = await readTagsFile(resolve(loaded.out, "tags.json"));
  const seed = nonNegativeInt.parse(options.seed);
  const taggedIds = loaded.snapshot.skills
    .map((skill) => skill.id)
    .filter((id) => tags.entries[id]);
  const sampleIds = shuffled(taggedIds, seed).slice(0, sampleSize).toSorted();
  const path = resolve(loaded.out, "stability.json");
  const existing = existsSync(path) ? await readStabilityFile(path) : null;
  await retagSample({
    snapshot: loaded.snapshot,
    tags,
    sampleIds,
    seed,
    existing,
    client: anthropicClient(),
    concurrency: positiveInt.parse(options.concurrency),
    path,
    progress: (complete, total, id) =>
      logger.info({ complete, total, id }, "Saved stability checkpoint"),
  });
  logger.info({ sample: sampleIds.length, path }, "Stability re-tagging complete");
}

async function loadReference(
  options: Options,
  loaded: { snapshot: SkillsSnapshotType; out: string },
): Promise<EmbeddingReference | null> {
  const candidates = [
    options.embeddings ? resolve(options.embeddings) : null,
    loaded.snapshot.source.kind === "embeddings-file" ? loaded.snapshot.source.path : null,
    resolve(HERE, "..", "skill-embeddings", "output", loaded.snapshot.workspace, "embeddings.json"),
  ].filter((candidate) => candidate !== null);
  const path = candidates.find((candidate) => existsSync(candidate));
  if (options.embeddings && path !== resolve(options.embeddings)) {
    throw new Error(`--embeddings file not found: ${options.embeddings}`);
  }
  if (!path) {
    logger.warn("No embeddings reference found; semantic agreement metrics are skipped");
    return null;
  }
  const embeddings = await readEmbeddings(path);
  if (embeddings.workspace !== loaded.snapshot.workspace) {
    throw new Error("Embeddings reference belongs to a different workspace.");
  }
  logger.info({ path, model: embeddings.model }, "Loaded embeddings reference");
  return toEmbeddingReference(embeddings);
}

async function evaluate(
  options: Options,
  loaded: { snapshot: SkillsSnapshotType; out: string },
): Promise<Metrics> {
  const tags = await readTagsFile(resolve(loaded.out, "tags.json"));
  const stabilityPath = resolve(loaded.out, "stability.json");
  const reference = await loadReference(options, loaded);
  const metrics = computeMetrics({
    snapshot: loaded.snapshot,
    tags,
    reference,
    stability: existsSync(stabilityPath) ? await readStabilityFile(stabilityPath) : null,
    seed: nonNegativeInt.parse(options.seed),
  });
  await saveJson(resolve(loaded.out, "metrics.json"), metrics);
  if (reference) {
    const ids = loaded.snapshot.skills.map((skill) => skill.id);
    await saveJson(resolve(loaded.out, "cosines.json"), {
      version: 1,
      model: reference.model,
      ids,
      values: referenceCosines(ids, reference),
    });
  }
  logger.info(
    {
      skills: metrics.counts.skills,
      distinctTagSets: metrics.counts.distinctTagSets,
      neighborOverlap: metrics.reference?.neighborOverlap ?? null,
      spearman: metrics.reference?.spearman ?? null,
      prefixAccuracy: metrics.families.prefixFunction.accuracy,
      estimatedCostUsd: metrics.usage.estimatedCostUsd,
    },
    "Saved metrics.json",
  );
  return metrics;
}

/**
 * @cc [owner:aubin-tchoi,label:security] report-escapes-untrusted-skill-content
 * Skill names, descriptions, instructions, and model summaries are untrusted. The dataset embedded
 * in `index.html` must be serialized with `<`, U+2028, and U+2029 escaped so it cannot close the
 * script element or break the script, and the viewer must render it as text, never as HTML.
 */
async function report(loaded: { snapshot: SkillsSnapshotType; out: string }): Promise<void> {
  const tags = await readTagsFile(resolve(loaded.out, "tags.json"));
  const metrics: unknown = JSON.parse(
    await readFile(resolve(loaded.out, "metrics.json"), "utf8"),
  );
  const cosinesPath = resolve(loaded.out, "cosines.json");
  const ids = loaded.snapshot.skills.map((skill) => skill.id);
  let cosines: { model: string; values: number[] } | null = null;
  if (existsSync(cosinesPath)) {
    const file = CosinesFile.parse(JSON.parse(await readFile(cosinesPath, "utf8")));
    if (
      file.ids.length !== ids.length ||
      file.ids.some((id, index) => id !== ids[index]) ||
      file.values.length !== (ids.length * (ids.length - 1)) / 2
    ) {
      throw new Error("cosines.json does not match the snapshot. Run the evaluate stage again.");
    }
    cosines = { model: file.model, values: file.values };
  }
  const dataset = {
    cosines,
    workspace: loaded.snapshot.workspace,
    model: tags.model,
    effort: tags.effort,
    maskNamePrefix: tags.maskNamePrefix,
    taxonomy: FACETS,
    skills: loaded.snapshot.skills.map((skill) => {
      const entry = tags.entries[skill.id];
      if (!entry) {
        throw new Error(`Skill ${skill.id} has no tags. Run the tag stage first.`);
      }
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        tools: skill.tools.map((server) => server.name),
        tokenCount: skill.tokenCount,
        tags: entry.tags,
        summary: entry.summary,
        confidence: entry.confidence,
        uncoveredAspects: entry.uncoveredAspects,
        truncated: entry.truncated,
      };
    }),
    metrics,
  };
  const template = await readFile(resolve(HERE, "viewer.html"), "utf8");
  const script = await readFile(resolve(HERE, "viewer.js"), "utf8");
  const embedded = JSON.stringify(dataset)
    .replaceAll("<", "\\u003c")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
  const html = template
    .replace("/*__DATA__*/", () => `const dataset = ${embedded};`)
    .replace("/*__VIEWER__*/", () => script);
  const path = resolve(loaded.out, "index.html");
  await writeFile(path, html, { mode: 0o600 });
  logger.info({ report: path }, "Open index.html in a browser");
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      workspace: { type: "string" },
      "from-embeddings": { type: "string" },
      input: { type: "string" },
      "dust-url": { type: "string", default: "https://dust.tt" },
      status: { type: "string", default: "active" },
      "include-unpublished": { type: "boolean", default: false },
      model: { type: "string", default: "claude-opus-5" },
      effort: { type: "string", default: "medium" },
      concurrency: { type: "string", default: "4" },
      limit: { type: "string" },
      "instruction-budget": { type: "string", default: "6000" },
      "keep-name-prefix": { type: "boolean", default: false },
      sample: { type: "string", default: "40" },
      seed: { type: "string", default: "42" },
      embeddings: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  const options: Options = {
    out: values.out,
    workspace: values.workspace,
    fromEmbeddings: values["from-embeddings"],
    input: values.input,
    dustUrl: values["dust-url"],
    status: values.status,
    includeUnpublished: values["include-unpublished"],
    model: values.model,
    effort: values.effort,
    concurrency: values.concurrency,
    limit: values.limit,
    instructionBudget: values["instruction-budget"],
    keepNamePrefix: values["keep-name-prefix"],
    sample: values.sample,
    seed: values.seed,
    embeddings: values.embeddings,
  };
  const command = z
    .enum(["snapshot", "tag", "stability", "evaluate", "report", "run"])
    .parse(positionals[0] ?? (values.help ? "snapshot" : undefined));
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  switch (command) {
    case "snapshot":
      await snapshot(options);
      return;
    case "tag":
      await tag(options, await loadSnapshot(options));
      return;
    case "stability":
      await stability(options, await loadSnapshot(options));
      return;
    case "evaluate":
      await evaluate(options, await loadSnapshot(options));
      return;
    case "report":
      await report(await loadSnapshot(options));
      return;
    case "run": {
      const wantsSnapshot = options.fromEmbeddings || options.input;
      const existingOut = options.out ?? (options.workspace ? outDirectory(options, options.workspace) : null);
      const loaded =
        !wantsSnapshot && existingOut && existsSync(resolve(existingOut, "skills.json"))
          ? await loadSnapshot(options)
          : await snapshot(options);
      await tag(options, loaded);
      await stability(options, loaded);
      await evaluate(options, loaded);
      await report(loaded);
      return;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    // Provider error messages may echo input; log status only for API failures.
    const describe = (failure: unknown): string =>
      failure instanceof Anthropic.APIError
        ? `Anthropic API returned HTTP ${failure.status ?? "unknown"}.`
        : failure instanceof Error
          ? failure.message
          : "Unexpected failure";
    const message =
      error instanceof AggregateError
        ? error.errors.map(describe).join(" | ")
        : describe(error);
    logger.error({ message }, "Skill tagging experiment failed");
    process.exitCode = 1;
  });
}
