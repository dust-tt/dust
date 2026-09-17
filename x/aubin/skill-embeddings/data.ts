import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { encode } from "gpt-tokenizer/encoding/cl100k_base";
import { z } from "zod";

const NamedText = z.object({ name: z.string(), description: z.string() });
const ToolView = z.object({
  name: z.string().nullable(),
  description: z.string().nullable(),
  server: NamedText.extend({ tools: z.array(NamedText) }),
  toolsMetadata: z
    .array(z.object({ toolName: z.string(), enabled: z.boolean() }))
    .optional(),
});

// Keep only semantic fields. In particular, never persist server secrets or custom headers.
export const PublicSkills = z.object({
  skills: z.array(
    z.object({
      sId: z.string(),
      name: z.string(),
      agentFacingDescription: z.string(),
      userFacingDescription: z.string(),
      instructions: z.string().nullable(),
      canRead: z.boolean(),
      tools: z.array(ToolView),
    }),
  ),
});

export const SkillText = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  tools: z.array(NamedText.extend({ tools: z.array(NamedText) })),
  text: z.string(),
  textHash: z.string(),
  tokenCount: z.number().int().positive(),
});

const Vector = z.array(z.number().finite()).min(1);
export const EmbeddingFile = z.object({
  version: z.literal(1),
  workspace: z.string(),
  dustUrl: z.string(),
  status: z.enum(["active", "archived", "suggested"]),
  includeUnpublished: z.boolean(),
  model: z.enum([
    "text-embedding-3-small",
    "text-embedding-3-large",
    "synthetic-demo",
  ]),
  dimensions: z.number().int().positive(),
  createdAt: z.string(),
  skills: z.array(SkillText.extend({ embedding: Vector.optional() })),
});
export type EmbeddingData = z.infer<typeof EmbeddingFile>;
export type TextRecord = z.infer<typeof SkillText>;

/**
 * @cc [owner:aubin-tchoi,label:security] embed-readable-semantic-fields-only
 * Redacted skills must fail extraction. Embedded and saved tool metadata must contain only
 * names and descriptions; disabled tools, credentials, headers, and IDs must not enter the text.
 */
export function extractSkills(payload: unknown): TextRecord[] {
  const parsed = PublicSkills.parse(payload);
  const ids = new Set<string>();
  return parsed.skills
    .map((skill) => {
      if (!skill.canRead || skill.instructions === null) {
        throw new Error(
          `Skill ${skill.sId} has redacted instructions. Use a key with access to its spaces.`,
        );
      }
      if (ids.has(skill.sId)) {
        throw new Error(`Duplicate skill ID: ${skill.sId}`);
      }
      ids.add(skill.sId);
      const tools = skill.tools
        .map((view) => {
          const disabled = new Set(
            view.toolsMetadata
              ?.filter((tool) => !tool.enabled)
              .map((tool) => tool.toolName),
          );
          return {
            name: view.name ?? view.server.name,
            description: view.description ?? view.server.description,
            tools: view.server.tools
              .filter((tool) => !disabled.has(tool.name))
              .toSorted((a, b) => a.name.localeCompare(b.name)),
          };
        })
        .toSorted((a, b) => a.name.localeCompare(b.name));
      const description =
        skill.agentFacingDescription || skill.userFacingDescription;
      const text = [
        `Name: ${skill.name}`,
        `Description: ${description}`,
        `Instructions:\n${skill.instructions}`,
        `Tools:\n${
          tools.length
            ? tools
                .map((server) =>
                  [
                    `- ${server.name}: ${server.description}`,
                    ...server.tools.map(
                      (tool) => `  - ${tool.name}: ${tool.description}`,
                    ),
                  ].join("\n"),
                )
                .join("\n")
            : "None"
        }`,
      ].join("\n\n");
      // Reject long input rather than silently remove instructions or tools from the experiment.
      const tokenCount = encode(text, { disallowedSpecial: new Set() }).length;
      if (tokenCount > 8191) {
        throw new Error(
          `Skill ${skill.sId} is ${tokenCount} tokens (limit 8191). Shorten it in an exported input file before embedding.`,
        );
      }
      return {
        id: skill.sId,
        name: skill.name,
        description,
        instructions: skill.instructions,
        tools,
        text,
        textHash: createHash("sha256").update(text).digest("hex"),
        tokenCount,
      };
    })
    .toSorted((a, b) => a.id.localeCompare(b.id));
}

export async function readEmbeddings(path: string): Promise<EmbeddingData> {
  const raw = await readFile(path, "utf8");
  const data = EmbeddingFile.parse(JSON.parse(raw));
  const ids = new Set<string>();
  for (const skill of data.skills) {
    if (
      ids.has(skill.id) ||
      skill.textHash !== createHash("sha256").update(skill.text).digest("hex")
    ) {
      throw new Error(
        "Saved embeddings contain duplicate IDs or a text/hash mismatch.",
      );
    }
    ids.add(skill.id);
    if (
      skill.embedding &&
      (skill.embedding.length !== data.dimensions ||
        !skill.embedding.some((value) => value !== 0))
    ) {
      throw new Error(
        `Invalid embedding dimensions or zero vector for ${skill.id}.`,
      );
    }
  }
  return data;
}

/**
 * @cc [owner:aubin-tchoi,label:cli] checkpoint-before-analysis
 * Embeddings must be saved after each successful batch and before projection or report generation.
 * Reuse is permitted only for matching workspace, endpoint, model, dimensions, and exact text hash.
 */
export async function embedSkills(
  data: EmbeddingData,
  path: string,
  embed: (texts: string[]) => Promise<number[][]>,
  progress: (complete: number, total: number) => void,
): Promise<EmbeddingData> {
  let current = { ...data, skills: data.skills.map((skill) => ({ ...skill })) };
  await saveJson(path, current);
  const pending = current.skills.filter((skill) => !skill.embedding);
  // At most 16 * 8191 tokens, below the provider's per-request token limit.
  for (let start = 0; start < pending.length; start += 16) {
    const batch = pending.slice(start, start + 16);
    const vectors = await embed(batch.map((skill) => skill.text));
    const validated = z.array(Vector).length(batch.length).parse(vectors);
    const byId = new Map(
      batch.map((skill, index) => [skill.id, validated[index]]),
    );
    if (
      validated.some(
        (vector) =>
          vector.length !== data.dimensions ||
          !vector.some((value) => value !== 0),
      )
    ) {
      throw new Error(
        "Embedding provider returned an invalid dimension or zero vector.",
      );
    }
    current = {
      ...current,
      skills: current.skills.map((skill) => ({
        ...skill,
        embedding: byId.get(skill.id) ?? skill.embedding,
      })),
    };
    await saveJson(path, current);
    progress(
      current.skills.filter((skill) => skill.embedding).length,
      current.skills.length,
    );
  }
  return current;
}

export function reuseEmbeddings(
  data: EmbeddingData,
  cached: EmbeddingData,
): EmbeddingData {
  if (
    data.workspace !== cached.workspace ||
    data.dustUrl !== cached.dustUrl ||
    data.model !== cached.model ||
    data.dimensions !== cached.dimensions
  ) {
    throw new Error(
      "Existing output belongs to a different workspace, endpoint, model, or dimension. Choose a different --out directory.",
    );
  }
  const byId = new Map(cached.skills.map((skill) => [skill.id, skill]));
  return {
    ...data,
    skills: data.skills.map((skill) => {
      const previous = byId.get(skill.id);
      return {
        ...skill,
        embedding:
          previous?.textHash === skill.textHash
            ? previous.embedding
            : undefined,
      };
    }),
  };
}

export async function saveJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(temporary, path);
}
