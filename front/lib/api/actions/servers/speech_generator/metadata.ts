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
  "spanish",
  "portuguese",
  "korean",
  "arabic",
  "turkish",
  "polish",
  "swedish",
  "russian",
  "indonesian",
  "filipino",
  "thai",
  "vietnamese",
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

const ALLOWED_AUDIO_URL_DOMAINS = [
  // Video platforms
  "youtube.com",
  "youtu.be",
  "googlevideo.com",
  "vimeo.com",
  "vimeocdn.com",
  "dailymotion.com",
  // Async video / screen recording
  "loom.com",
  "tella.tv",
  "wistia.com",
  "wistia.net",
  "vidyard.com",
  // Meeting recordings & AI notetakers
  "zoom.us",
  "webex.com",
  "grain.com",
  "riverside.fm",
  "fathom.video",
  "granola.so",
  "fireflies.ai",
  "otter.ai",
  "tldv.io",
  "meetgeek.ai",
  "avoma.com",
  "gong.io",
  "chorus.ai",
  "read.ai",
  "bluedot.ai",
  "notta.ai",
  "sembly.ai",
  "tactiq.io",
  "meetjamie.ai",
  // Cloud storage
  "drive.google.com",
  "googleusercontent.com",
  "sharepoint.com",
  "onedrive.live.com",
  "onedrive.com",
  "1drv.ms",
  "dropbox.com",
  "dropboxusercontent.com",
  // Collaboration / comms
  "slack.com",
  // Audio
  "soundcloud.com",
] as const;

export function isAllowedAudioUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_AUDIO_URL_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export const SPEECH_GENERATOR_TOOLS_METADATA = createToolsRecord({
  speech_to_text: {
    description:
      "Transcribe speech from an audio or video file into text. " +
      "Supported formats: MP3, WAV, OGG, FLAC, AAC, MP4, MOV, WEBM, MKV, and most " +
      "common audio/video formats.",
    schema: {
      audio_url: z
        .string()
        .url()
        .refine(isAllowedAudioUrl, {
          message: `URL must be from an allowed domain: ${ALLOWED_AUDIO_URL_DOMAINS.join(", ")}.`,
        })
        .optional()
        .describe(
          "HTTPS URL of the audio or video file to transcribe. " +
            "Only URLs from the allowlist of known video/audio platforms are accepted. " +
            "Mutually exclusive with audio_blob."
        ),
      audio_blob: z
        .string()
        .optional()
        .describe(
          "Base64-encoded content of an audio or video file. " +
            "Mutually exclusive with audio_url."
        ),
      language_code: z
        .string()
        .optional()
        .describe(
          "ISO-639-1 or ISO-639-3 language code of the audio (e.g. 'en', 'fr'). " +
            "Auto-detected if omitted."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Transcribing audio",
      done: "Transcribe audio",
    },
  },
  text_to_speech: {
    description: "Generate speech audio from a text prompt with desired voice.",
    schema: {
      text: z
        .string()
        .min(1)
        .max(5_000)
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
