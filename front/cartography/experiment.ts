import { computeGroupingScore } from "@app/cartography/scoring";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import type { AgentCartographyCoordinates } from "@app/types/api/assistant/cartography";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { PCA } from "ml-pca";
import OpenAI from "openai";

const WORKSPACE_ID = "vigqnm0JoT";
const USER_ID = "DIJEPbgQe2";

function buildAgentEmbeddingInput(agent: AgentConfigurationType): string {
  return [
    `Name: ${agent.name}`,
    `Description: ${agent.description}`,
    `Instructions: ${agent.instructions ?? ""}`,
  ].join("\n");
}

// --- Transform building blocks -------------------------------------------

function l2normalizeRows(rows: number[][]): number[][] {
  return rows.map((r) => {
    const norm = Math.hypot(...r) || 1;
    return r.map((v) => v / norm);
  });
}

// Baseline normalization: scale each axis independently to [0, 1].
function normalizePerAxis(points: number[][]): [number, number][] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = (v: number, min: number, max: number): number =>
    max > min ? (v - min) / (max - min) : 0.5;
  return points.map((p) => [scale(p[0], minX, maxX), scale(p[1], minY, maxY)]);
}

// Uniform normalization: translate to min corner, divide BOTH axes by the same
// factor (the larger of the two axis ranges). Preserves the PCA aspect ratio.
function normalizeUniform(points: number[][]): [number, number][] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  return points.map((p) => [(p[0] - minX) / span, (p[1] - minY) / span]);
}

function pcaTo2D(embeddings: number[][]): number[][] {
  const pca = new PCA(embeddings);
  return pca.predict(embeddings, { nComponents: 2 }).to2DArray();
}

function toCoords(
  agents: AgentConfigurationType[],
  normalized: [number, number][]
): AgentCartographyCoordinates {
  const coordinates: AgentCartographyCoordinates = {};
  agents.forEach((agent, i) => {
    coordinates[agent.sId] = normalized[i];
  });
  return coordinates;
}

interface EmbedConfig {
  label: string;
  model: string;
  dimensions: number;
}

const EMBED_CONFIGS: EmbedConfig[] = [
  { label: "small@1536", model: "text-embedding-3-small", dimensions: 1536 },
  { label: "small@512", model: "text-embedding-3-small", dimensions: 512 },
  { label: "small@256", model: "text-embedding-3-small", dimensions: 256 },
  { label: "large@3072", model: "text-embedding-3-large", dimensions: 3072 },
  { label: "large@1024", model: "text-embedding-3-large", dimensions: 1024 },
  { label: "large@512", model: "text-embedding-3-large", dimensions: 512 },
];

makeScript({}, async (_args, logger) => {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    USER_ID,
    WORKSPACE_ID
  );

  const agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "full",
  });

  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const apiKey =
    credentials.OPENAI_EMBEDDING_API_KEY ?? credentials.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error("No OpenAI API key available.");
    return;
  }
  const openai = new OpenAI({
    apiKey,
    baseURL: credentials.OPENAI_BASE_URL || undefined,
  });

  const inputs = agents.map(buildAgentEmbeddingInput);

  // Embed once per (model, dimensions) and cache the raw vectors.
  const rawByConfig = new Map<string, number[][]>();
  for (const cfg of EMBED_CONFIGS) {
    const response = await openai.embeddings.create({
      model: cfg.model,
      dimensions: cfg.dimensions,
      input: inputs,
    });
    const emb = new Array<number[]>(agents.length);
    for (const item of response.data) {
      emb[item.index] = item.embedding;
    }
    rawByConfig.set(cfg.label, emb);
  }

  // Sweep: for each embedding config x {raw, l2} x {per-axis, uniform}.
  interface Row {
    embed: string;
    l2: boolean;
    norm: string;
    silhouette: number;
    intra: number;
    inter: number;
  }
  const rows: Row[] = [];

  for (const cfg of EMBED_CONFIGS) {
    const raw = rawByConfig.get(cfg.label)!;
    for (const l2 of [false, true]) {
      const emb = l2 ? l2normalizeRows(raw) : raw;
      const scores = pcaTo2D(emb);
      for (const norm of ["per-axis", "uniform"] as const) {
        const normalized =
          norm === "per-axis"
            ? normalizePerAxis(scores)
            : normalizeUniform(scores);
        const coords = toCoords(agents, normalized);
        const s = computeGroupingScore(coords);
        rows.push({
          embed: cfg.label,
          l2,
          norm,
          silhouette: s.silhouette,
          intra: s.intra,
          inter: s.inter,
        });
      }
    }
  }

  rows.sort((a, b) => b.silhouette - a.silhouette);

  const header =
    "  embed        l2     norm       silhouette   intra    inter   note";
  const line = (r: Row, note: string): string =>
    [
      `  ${r.embed.padEnd(11)}`,
      `${(r.l2 ? "yes" : "no").padEnd(5)}`,
      `${r.norm.padEnd(9)}`,
      `${r.silhouette.toFixed(4).padStart(9)}`,
      `${r.intra.toFixed(4).padStart(8)}`,
      `${r.inter.toFixed(4).padStart(8)}`,
      `  ${note}`,
    ].join("  ");

  const isBaseline = (r: Row): boolean =>
    r.embed === "small@1536" && !r.l2 && r.norm === "per-axis";

  console.log(
    [
      "Cartography experiment sweep (higher silhouette = better)",
      "",
      header,
      "  " + "-".repeat(header.length),
      ...rows.map((r) => line(r, isBaseline(r) ? "<- BASELINE" : "")),
    ].join("\n")
  );
});
