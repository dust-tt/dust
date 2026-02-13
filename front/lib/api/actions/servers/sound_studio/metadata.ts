import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SOUND_STUDIO_SERVER_NAME = "sound_studio" as const;

export const SOUND_STUDIO_TOOLS_METADATA = createToolsRecord({
  generate_sound_effects: {
    description: "Generate a short sound effect from a text prompt.",
    schema: {
      prompt: z
        .string()
        .min(1)
        .max(2000)
        .describe(
          "Describe the sound effect to generate (eg: 'whoosh transition with metallic resonance')."
        ),
      duration_s: z
        .number()
        .min(0.5)
        .max(30)
        .optional()
        .default(3)
        .describe(
          "Target duration of the generated sound effect in seconds (0.5s to 30s)."
        ),
      loop: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to create a sound effect that loops smoothly."),
      name: z
        .string()
        .max(128)
        .optional()
        .default("sfx")
        .describe("Base filename (without extension) for the generated audio."),
    },
    stake: "low",
    displayLabels: {
      running: "Generating sound effect",
      done: "Generate sound effect",
    },
  },
});

export const SOUND_STUDIO_SERVER = {
  serverInfo: {
    name: "sound_studio",
    version: "1.0.0",
    description: "Create music tracks and sound effects",
    authorization: null,
    icon: "ActionNoiseIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(SOUND_STUDIO_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SOUND_STUDIO_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
