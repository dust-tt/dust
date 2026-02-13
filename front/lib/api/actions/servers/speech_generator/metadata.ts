import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const VOICE_GENDERS = ["female", "male"] as const;

export type VoiceGender = (typeof VOICE_GENDERS)[number];

export const VOICE_LANGUAGES = [
  "english_american",
  "english_british",
  "french",
  "german",
  "dutch",
  "italian",
  "japanese",
  "hindi",
  "chinese",
] as const;

export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export const VOICE_USE_CASES = [
  "narrative_story",
  "conversational",
  "characters_animation",
  "social_media",
  "entertainment_tv",
  "advertisement",
  "informative_educational",
] as const;

export type VoiceUseCase = (typeof VOICE_USE_CASES)[number];

export const SPEECH_GENERATOR_SERVER_NAME = "speech_generator" as const;

export const SPEECH_GENERATOR_TOOLS_METADATA = createToolsRecord({
  text_to_speech: {
    description: "Generate speech audio from a text prompt with desired voice.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Generating speech",
      done: "Generate speech",
    },
  },
  text_to_dialogue: {
    description: "Generate dialogue audio from multiple lines with speakers.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Generating dialogue",
      done: "Generate dialogue",
    },
  },
});

export const SPEECH_GENERATOR_SERVER = {
  serverInfo: {
    name: "speech_generator",
    version: "1.0.0",
    description: "Turn written text into spoken audio or dialog",
    authorization: null,
    icon: "ActionSpeakIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(SPEECH_GENERATOR_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SPEECH_GENERATOR_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
