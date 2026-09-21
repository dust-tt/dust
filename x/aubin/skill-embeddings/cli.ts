import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import OpenAI from "openai";
import { z } from "zod";
import logger from "../../../front/logger/logger";
import { EnvironmentConfig } from "../../../front/types/shared/utils/config";
import { analyze } from "./analysis";
import type { EmbeddingData } from "./data";
import {
  embedSkills,
  EMBEDDING_TOKEN_LIMIT,
  extractSkills,
  readEmbeddings,
  reuseEmbeddings,
  saveJson,
} from "./data";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const HELP = `Workspace skill embeddings

Fetch, embed, and explore:
  node --import tsx x/aubin/skill-embeddings/cli.ts --workspace WORKSPACE_ID

Analyze saved vectors again, without API calls:
  node --import tsx x/aubin/skill-embeddings/cli.ts --from output/embeddings.json --clusters 3,5,8

Options:
  --workspace ID           Workspace string ID (required for fetching)
  --dust-url URL           Dust origin, default https://dust.tt; use your workspace region
  --include-unpublished   Include editor-only skills; requires an admin API key
  --status STATUS          active (default), archived, or suggested
  --input FILE             Read a public skills API response instead of fetching
  --from FILE              Reanalyze a saved embeddings.json offline
  --out DIRECTORY          Default x/aubin/skill-embeddings/output/WORKSPACE_ID
  --model MODEL            text-embedding-3-large (default) or text-embedding-3-small
  --dimensions N           Default 1536; large supports up to 3072, small up to 1536
  --clusters K,K,...        Default 2,3,4,5,6,8,10; each 1..20, capped to distinct vectors
  --seed N                 Reproducible clustering seed, default 42
  --help                   Show this help

Credentials: DUST_API_KEY and OPENAI_EMBEDDING_API_KEY (fallback OPENAI_API_KEY).
Node's --env-file=/path/to/credentials.env may be used before --import.
Reruns reuse matching vectors and resume incomplete embedding files.
Only names, descriptions, instructions, and enabled tool metadata are embedded.
`;

function httpOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  ) {
    throw new Error(
      "--dust-url must be an HTTPS origin (HTTP is allowed for localhost).",
    );
  }
  return url.origin;
}

export async function fetchSkills(
  origin: string,
  workspace: string,
  status: string,
  unpublished: boolean,
  key: string,
) {
  const url = new URL(
    `/api/v1/w/${encodeURIComponent(workspace)}/skills`,
    origin,
  );
  url.searchParams.set("status", status);
  if (unpublished) {
    url.searchParams.set("bypassEditorVisibility", "true");
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(60_000),
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(
      `Skills API returned HTTP ${response.status}. Check workspace region, key permissions, and visibility.`,
    );
  }
  return response.json();
}

export async function writeReport(
  data: EmbeddingData,
  out: string,
  clusters: number[],
  seed: number,
) {
  logger.info(
    { skills: data.skills.length },
    "Computing PCA and clustering in the full embedding space",
  );
  const analysis = analyze(data, clusters, seed);
  await saveJson(resolve(out, "analysis.json"), analysis);
  const template = await readFile(resolve(HERE, "viewer.html"), "utf8");
  const script = await readFile(resolve(HERE, "viewer.js"), "utf8");
  // Skill content is untrusted, including literal closing script tags and HTML.
  const embedded = JSON.stringify(analysis)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  const html = template
    .replace("/*__DATA__*/", () => `const dataset = ${embedded};`)
    .replace("/*__VIEWER__*/", () => script);
  await writeFile(resolve(out, "index.html"), html, { mode: 0o600 });
  logger.info(
    {
      report: resolve(out, "index.html"),
    },
    "Open index.html in a browser",
  );
}

export async function fetchEmbeddings(
  client: OpenAI,
  model: string,
  dimensions: number,
  inputs: number[][],
): Promise<number[][]> {
  const response = await client.embeddings.create({
    model,
    dimensions,
    input: inputs,
    encoding_format: "float",
  });
  const ordered = response.data.toSorted((a, b) => a.index - b.index);
  if (ordered.some((item, index) => item.index !== index)) {
    throw new Error("Embedding response has missing or duplicate indices.");
  }
  return ordered.map((item) => item.embedding);
}

async function main() {
  const { values } = parseArgs({
    options: {
      workspace: { type: "string" },
      "dust-url": { type: "string", default: "https://dust.tt" },
      "include-unpublished": { type: "boolean", default: false },
      status: { type: "string", default: "active" },
      input: { type: "string" },
      from: { type: "string" },
      out: { type: "string" },
      model: { type: "string", default: "text-embedding-3-large" },
      dimensions: { type: "string", default: "1536" },
      clusters: { type: "string", default: "2,3,4,5,6,8,10" },
      seed: { type: "string", default: "42" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const clusters = z
    .array(z.coerce.number().int().min(1).max(20))
    .min(1)
    .parse(values.clusters.split(","));
  const seed = z.coerce
    .number()
    .int()
    .min(0)
    .max(4294967295)
    .parse(values.seed);
  if (values.from) {
    if (values.input || values.workspace) {
      throw new Error("Use --from on its own, without --workspace or --input.");
    }
    const data = await readEmbeddings(resolve(values.from));
    const out = values.out
      ? resolve(values.out)
      : dirname(resolve(values.from));
    await writeReport(data, out, clusters, seed);
    return;
  }
  const workspace = z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/, "Provide a workspace string ID with --workspace")
    .parse(values.workspace);
  const origin = httpOrigin(values["dust-url"]);
  const model = z
    .enum(["text-embedding-3-large", "text-embedding-3-small"])
    .parse(values.model);
  const dimensions = z.coerce
    .number()
    .int()
    .min(2)
    .max(model === "text-embedding-3-large" ? 3072 : 1536)
    .parse(values.dimensions);
  const status = z
    .enum(["active", "archived", "suggested"])
    .parse(values.status);
  const out = resolve(values.out ?? resolve(HERE, "output", workspace));
  const path = resolve(out, "embeddings.json");
  const dustKey = EnvironmentConfig.getOptionalEnvVariable("DUST_API_KEY");
  if (!values.input && !dustKey) {
    throw new Error("Set DUST_API_KEY to fetch workspace skills.");
  }
  const payload = values.input
    ? JSON.parse(await readFile(resolve(values.input), "utf8"))
    : await fetchSkills(
        origin,
        workspace,
        status,
        values["include-unpublished"],
        dustKey ?? "",
      );
  const skills = extractSkills(payload);
  if (!skills.length) {
    throw new Error(
      "No skills returned. Check workspace, status, and --include-unpublished.",
    );
  }
  let data: EmbeddingData = {
    version: 1,
    workspace,
    dustUrl: origin,
    status,
    includeUnpublished: values["include-unpublished"],
    model,
    dimensions,
    createdAt: new Date().toISOString(),
    skills,
  };
  if (existsSync(path)) {
    const cached = await readEmbeddings(path);
    data = reuseEmbeddings(data, cached);
  }
  const missing = data.skills.filter((skill) => !skill.embedding).length;
  logger.info(
    {
      skills: skills.length,
      cached: skills.length - missing,
      pending: missing,
      chunkedSkills: data.skills.filter(
        (skill) => skill.tokenCount > EMBEDDING_TOKEN_LIMIT,
      ).length,
      tokens: data.skills
        .filter((skill) => !skill.embedding)
        .reduce((sum, skill) => sum + skill.tokenCount, 0),
    },
    "Prepared embedding inputs",
  );
  const key =
    EnvironmentConfig.getOptionalEnvVariable("OPENAI_EMBEDDING_API_KEY") ??
    EnvironmentConfig.getOptionalEnvVariable("OPENAI_API_KEY");
  if (missing > 0 && !key) {
    throw new Error(
      "Set OPENAI_EMBEDDING_API_KEY (or OPENAI_API_KEY) to embed new inputs.",
    );
  }
  const client = key
    ? new OpenAI({
        apiKey: key,
        baseURL: "https://api.openai.com/v1",
        timeout: 60_000,
        maxRetries: 3,
      })
    : null;
  const completed = await embedSkills(
    data,
    path,
    async (inputs) => {
      if (!client) {
        throw new Error("Missing embedding client.");
      }
      return fetchEmbeddings(client, model, dimensions, inputs);
    },
    (complete, total) =>
      logger.info({ complete, total }, "Saved embedding checkpoint"),
  );
  await writeReport(completed, out, clusters, seed);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    // Provider error messages may echo input; log status only for API failures.
    const message =
      error instanceof OpenAI.APIError
        ? `Embedding API returned HTTP ${error.status ?? "unknown"}.`
        : error instanceof Error
          ? error.message
          : "Unexpected failure";
    logger.error({ message }, "Skill embedding experiment failed");
    process.exitCode = 1;
  });
}
