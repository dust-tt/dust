import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const SkillAttachmentSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      "Source file path to attach. Use a scoped path returned by files__list, such as conversation-<id>/script.py, or the matching sandbox path under /files/."
    ),
  fileName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional destination file name/path inside the skill, such as scripts/process.py. Defaults to the source file name."
    ),
});

export const SKILLS_TOOLS_METADATA = createToolsRecord({
  create_skill: {
    description:
      "Create a new workspace skill from a description and concise instructions.",
    schema: {
      name: z.string().describe("The new skill name."),
      description: z
        .string()
        .describe(
          "Short description of what the skill does and when an agent should use it."
        ),
      instructions: z
        .string()
        .describe("Markdown instructions that define the skill behavior."),
    },
    stake: "medium",
    displayLabels: {
      running: "Creating skill",
      done: "Create skill",
    },
  },
  edit_skill: {
    description:
      "Edit an existing workspace skill's instructions by replacing exact text. This avoids full-instruction rewrites.",
    schema: {
      skillName: z.string().min(1).describe("The exact skill name."),
      oldString: z
        .string()
        .min(1)
        .describe(
          "The exact instruction text to replace. Must match the current instructions exactly, including whitespace."
        ),
      newString: z
        .string()
        .describe(
          "The exact replacement text to put in the skill instructions."
        ),
      expectedReplacements: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Optional number of expected replacements. Defaults to 1. Use when replacing multiple identical instances."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Editing skill",
      done: "Edit skill",
    },
  },
  upload_skill_files: {
    description:
      "Upload files from source paths and attach them to an existing workspace skill. Use for scripts, references, templates, or assets.",
    schema: {
      skillName: z.string().min(1).describe("The exact skill name."),
      files: z
        .array(SkillAttachmentSchema)
        .min(1)
        .describe("Source files to upload and attach to the skill."),
      replaceExistingFiles: z
        .boolean()
        .optional()
        .describe(
          "When files are supplied, replace existing file attachments instead of appending. Defaults to false."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Uploading skill files",
      done: "Upload skill files",
    },
  },
});

export const SKILLS_SERVER = {
  serverInfo: {
    name: "skills",
    version: "1.0.0",
    description: "Tools for creating and editing workspace skills.",
    authorization: null,
    icon: "PuzzleIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(SKILLS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SKILLS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
