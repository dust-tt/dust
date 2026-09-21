import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { decode, encode } from "gpt-tokenizer/encoding/cl100k_base";
import { z } from "zod/v4";
import {
  extractSkills,
  readEmbeddings,
  saveJson,
} from "../skill-embeddings/data";

const NamedText = z.object({ name: z.string(), description: z.string() });

export const SkillRecord = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  tools: z.array(NamedText.extend({ tools: z.array(NamedText) })),
  text: z.string(),
  textHash: z.string(),
  tokenCount: z.number().int().positive(),
});
export type SkillRecordType = z.infer<typeof SkillRecord>;

export const SkillsSnapshot = z.object({
  version: z.literal(1),
  workspace: z.string(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("embeddings-file"), path: z.string() }),
    z.object({ kind: z.literal("input-file"), path: z.string() }),
    z.object({
      kind: z.literal("api"),
      dustUrl: z.string(),
      status: z.string(),
      includeUnpublished: z.boolean(),
    }),
  ]),
  createdAt: z.string(),
  skills: z.array(SkillRecord),
});
export type SkillsSnapshotType = z.infer<typeof SkillsSnapshot>;

function checkSnapshot(snapshot: SkillsSnapshotType): SkillsSnapshotType {
  const ids = new Set<string>();
  for (const skill of snapshot.skills) {
    if (ids.has(skill.id)) {
      throw new Error(`Snapshot contains duplicate skill ID ${skill.id}.`);
    }
    ids.add(skill.id);
    if (
      skill.textHash !== createHash("sha256").update(skill.text).digest("hex")
    ) {
      throw new Error(`Snapshot text/hash mismatch for ${skill.id}.`);
    }
  }
  if (snapshot.skills.length === 0) {
    throw new Error("Snapshot contains no skills.");
  }
  return snapshot;
}

export async function readSnapshot(path: string): Promise<SkillsSnapshotType> {
  const raw = await readFile(path, "utf8");
  return checkSnapshot(SkillsSnapshot.parse(JSON.parse(raw)));
}

/**
 * @cc [owner:aubin-tchoi,label:product] snapshot-from-embeddings-drops-vectors
 * A snapshot built from a saved `embeddings.json` must keep every skill of that file with its exact
 * text and hash, and must not persist any embedding vector. The workspace is taken from the file.
 */
export async function snapshotFromEmbeddings(
  path: string,
): Promise<SkillsSnapshotType> {
  const embeddings = await readEmbeddings(path);
  return checkSnapshot({
    version: 1,
    workspace: embeddings.workspace,
    source: { kind: "embeddings-file", path },
    createdAt: new Date().toISOString(),
    skills: embeddings.skills
      .map(
        ({
          id,
          name,
          description,
          instructions,
          tools,
          text,
          textHash,
          tokenCount,
        }) => ({
          id,
          name,
          description,
          instructions,
          tools,
          text,
          textHash,
          tokenCount,
        }),
      )
      .toSorted((a, b) => a.id.localeCompare(b.id)),
  });
}

export function snapshotFromPayload(
  payload: unknown,
  workspace: string,
  source: SkillsSnapshotType["source"],
): SkillsSnapshotType {
  return checkSnapshot({
    version: 1,
    workspace,
    source,
    createdAt: new Date().toISOString(),
    skills: extractSkills(payload),
  });
}

export type TaggingInputOptions = {
  // Strip leading bracketed team labels such as "[GTM]" from the name shown to the model.
  maskNamePrefix: boolean;
  // Maximum cl100k tokens of instructions sent to the model.
  instructionTokenBudget: number;
};

export type TaggingInput = {
  id: string;
  nameShown: string;
  text: string;
  inputHash: string;
  truncated: boolean;
};

const BRACKET_PREFIX = /^\s*(\[[^\]]*\]\s*)+/;

export function bracketPrefixes(name: string): string[] {
  const match = name.match(BRACKET_PREFIX);
  if (!match) {
    return [];
  }
  return [...match[0].matchAll(/\[([^\]]*)\]/g)].map((group) =>
    group[1].trim().toLowerCase(),
  );
}

export function maskedName(name: string): string {
  const stripped = name.replace(BRACKET_PREFIX, "").trim();
  return stripped.length > 0 ? stripped : name.trim();
}

/**
 * @cc [owner:aubin-tchoi,label:product] tagging-input-composition
 * The tagging input must contain the (optionally masked) name, the description, the enabled tool
 * names and descriptions, and the instructions truncated to at most `instructionTokenBudget`
 * cl100k tokens, with an explicit truncation marker stating the number of omitted tokens. The
 * input hash must be the SHA-256 of the exact text sent.
 */
export function buildTaggingInput(
  skill: SkillRecordType,
  options: TaggingInputOptions,
): TaggingInput {
  if (!Number.isInteger(options.instructionTokenBudget) || options.instructionTokenBudget < 1) {
    throw new Error("instructionTokenBudget must be a positive integer.");
  }
  const nameShown = options.maskNamePrefix ? maskedName(skill.name) : skill.name;
  const tokens = encode(skill.instructions, { disallowedSpecial: new Set() });
  const truncated = tokens.length > options.instructionTokenBudget;
  const instructions = truncated
    ? `${decode(tokens.slice(0, options.instructionTokenBudget))}\n[... truncated ${
        tokens.length - options.instructionTokenBudget
      } tokens]`
    : skill.instructions;
  const tools =
    skill.tools.length === 0
      ? "None"
      : skill.tools
          .map((server) =>
            [
              `- ${server.name}: ${server.description}`,
              ...server.tools.map((tool) => `  - ${tool.name}: ${tool.description}`),
            ].join("\n"),
          )
          .join("\n");
  const text = [
    `Name: ${nameShown}`,
    `Description: ${skill.description}`,
    `Enabled tools:\n${tools}`,
    `Instructions:\n${instructions}`,
  ].join("\n\n");
  return {
    id: skill.id,
    nameShown,
    text,
    inputHash: createHash("sha256").update(text).digest("hex"),
    truncated,
  };
}

export { saveJson };
