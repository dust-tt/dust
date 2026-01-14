import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

export const SOUND_STUDIO_TOOL_NAME = "sound_studio" as const;

export const generateSoundEffectsSchema = {
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
};

export const SOUND_STUDIO_TOOLS: MCPToolType[] = [
  {
    name: "generate_sound_effects",
    description: "Generate a short sound effect from a text prompt.",
    inputSchema: zodToJsonSchema(
      z.object(generateSoundEffectsSchema)
    ) as JSONSchema7,
  },
];

export const SOUND_STUDIO_SERVER_INFO = {
  name: "sound_studio" as const,
  version: "1.0.0",
  description: "Create music tracks and sound effects",
  authorization: null,
  icon: "ActionNoiseIcon" as const,
  documentationUrl: null,
  instructions: null,
};

export const SOUND_STUDIO_TOOL_STAKES = {
  generate_sound_effects: "low",
} as const satisfies Record<string, MCPToolStakeLevelType>;
