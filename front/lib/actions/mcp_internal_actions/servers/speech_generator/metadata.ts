import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  VOICE_GENDERS,
  VOICE_LANGUAGES,
  VOICE_USE_CASES,
} from "@app/lib/actions/mcp_internal_actions/servers/elevenlabs/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

// =============================================================================
// Constants - Exported for monitoring
// =============================================================================

export const SPEECH_GENERATOR_TOOL_NAME = "speech_generator" as const;

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const textToSpeechSchema = {
  text: z
    .string()
    .min(1)
    .max(10_000)
    .describe("The text to convert to speech."),
  gender: z
    .enum(VOICE_GENDERS)
    .optional()
    .default("female")
    .describe(
      "The desired gender of the voice. Possible options are female, male, or neutral."
    ),
  language: z
    .enum(VOICE_LANGUAGES)
    .optional()
    .default("english_american")
    .describe(
      "Preferred language/accent for the voice (does not translate text)."
    ),
  use_case: z
    .enum(VOICE_USE_CASES)
    .optional()
    .default("conversational")
    .describe(
      "Intended use case for the voice (used for better voice selection in the future)."
    ),
  name: z
    .string()
    .max(128)
    .optional()
    .default("speech")
    .describe("Base filename (without extension) for the generated audio."),
};

export const textToDialogueSchema = {
  dialogues: z
    .array(
      z.object({
        speaker: z
          .object({
            gender: z.enum(VOICE_GENDERS),
            language: z.enum(VOICE_LANGUAGES),
            use_case: z.enum(VOICE_USE_CASES),
          })
          .describe(
            "The speaker for this line. An object with { gender, language, use_case }."
          ),
        text: z
          .string()
          .min(1)
          .max(10_000)
          .describe("The text content for this speaker line."),
      })
    )
    .min(1)
    .max(5_000)
    .describe(
      "An array of dialogue lines, each with a speaker and text. Maximum of 5_000 lines."
    ),
  name: z
    .string()
    .max(128)
    .optional()
    .default("dialogue")
    .describe("Base filename (without extension) for the generated audio."),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const SPEECH_GENERATOR_TOOLS: MCPToolType[] = [
  {
    name: "text_to_speech",
    description: "Generate speech audio from a text prompt with desired voice.",
    inputSchema: zodToJsonSchema(z.object(textToSpeechSchema)) as JSONSchema7,
  },
  {
    name: "text_to_dialogue",
    description: "Generate dialogue audio from multiple lines with speakers.",
    inputSchema: zodToJsonSchema(z.object(textToDialogueSchema)) as JSONSchema7,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const SPEECH_GENERATOR_SERVER_INFO = {
  name: "speech_generator" as const,
  version: "1.0.0",
  description: "Turn written text into spoken audio or dialog",
  authorization: null,
  icon: "ActionSpeakIcon" as const,
  documentationUrl: null,
  instructions: null,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const SPEECH_GENERATOR_TOOL_STAKES = {
  text_to_speech: "low",
  text_to_dialogue: "low",
} as const satisfies Record<string, MCPToolStakeLevelType>;
