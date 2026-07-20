import type {
  InternalMCPToolType,
  ServerMetadata,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const SOUND_STUDIO_SERVER_NAME = "sound_studio" as const;

export const SOUND_STUDIO_TOOLS_METADATA = [
  {
    name: "generate_sound_effects",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const;

export const SOUND_STUDIO_SERVER = {
  serverInfo: {
    name: "sound_studio",
    version: "1.0.0",
    description: "Create music tracks and sound effects",
    authorization: null,
    icon: "ActionNoiseIcon",
    documentationUrl: null,
  },
  tools: SOUND_STUDIO_TOOLS_METADATA,
} as const satisfies ServerMetadata;
