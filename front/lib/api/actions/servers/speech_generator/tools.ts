import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getElevenLabsClient,
  resolveDefaultVoiceId,
  streamToBase64,
} from "@app/lib/api/actions/servers/elevenlabs/utils";
import {
  isAllowedAudioUrl,
  SPEECH_GENERATOR_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/speech_generator/metadata";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const handlers: ToolHandlers<typeof SPEECH_GENERATOR_TOOLS_METADATA> = {
  speech_to_text: async ({ audio_url, audio_blob, language_code }) => {
    if (!audio_url && !audio_blob) {
      return new Err(
        new MCPError("Either audio_url or audio_blob must be provided.")
      );
    }

    if (audio_url && !isAllowedAudioUrl(audio_url)) {
      return new Err(
        new MCPError(
          "audio_url must be from an allowed domain. Check the tool schema for the list of accepted platforms."
        )
      );
    }

    try {
      const client = getElevenLabsClient();

      const result = await client.speechToText.convert({
        ...(audio_url
          ? { sourceUrl: audio_url }
          : { file: Buffer.from(audio_blob!, "base64") }),
        modelId: "scribe_v2",
        enableLogging: false,
        ...(language_code ? { languageCode: language_code } : {}),
      });

      return new Ok([{ type: "text" as const, text: result.text }]);
    } catch (e) {
      const cause = normalizeError(e);
      return new Err(
        new MCPError(
          `Error transcribing audio with ElevenLabs: ${cause.message}`,
          { cause }
        )
      );
    }
  },

  text_to_speech: async ({
    text,
    gender = "female",
    language = "english_american",
    use_case = "conversational",
    name = "speech",
  }) => {
    try {
      const client = getElevenLabsClient();

      const voiceId = await resolveDefaultVoiceId({
        language,
        useCase: use_case,
        gender,
      });

      const stream = await client.textToSpeech.convert(voiceId, {
        text,
        enableLogging: false,
        modelId: "eleven_v3",
        outputFormat: "mp3_44100_128",
      });

      const base64 = await streamToBase64(stream);
      const fileName = `${name}.mp3`;

      return new Ok([
        {
          type: "resource" as const,
          resource: {
            name: fileName,
            blob: base64,
            _meta: { text: "Your audio file was generated successfully." },
            mimeType: "audio/mpeg",
            uri: fileName,
          },
        },
      ]);
    } catch (e) {
      const cause = normalizeError(e);
      return new Err(
        new MCPError(
          `Error generating speech audio with ElevenLabs: ${cause.message}`,
          {
            cause,
          }
        )
      );
    }
  },

  text_to_dialogue: async ({ dialogues, name = "dialogue" }) => {
    try {
      const client = getElevenLabsClient();

      // resolveDefaultVoiceId is called once (cached after first call), so
      // sequential resolution here avoids redundant API fetches on cold start.
      const inputs: { text: string; voiceId: string }[] = [];
      for (const d of dialogues) {
        const { gender, language, use_case: useCase } = d.speaker;
        inputs.push({
          text: d.text,
          voiceId: await resolveDefaultVoiceId({ gender, language, useCase }),
        });
      }

      const stream = await client.textToDialogue.stream({
        inputs,
        modelId: "eleven_v3",
        outputFormat: "mp3_44100_128",
      });

      const base64 = await streamToBase64(stream);
      const fileName = `${name}.mp3`;

      return new Ok([
        {
          type: "resource" as const,
          resource: {
            name: fileName,
            blob: base64,
            _meta: {
              text: "Your dialogue audio file was generated successfully.",
            },
            mimeType: "audio/mpeg",
            uri: fileName,
          },
        },
      ]);
    } catch (e) {
      const cause = normalizeError(e);
      return new Err(
        new MCPError(
          `Error generating dialogue audio with ElevenLabs: ${cause.message}`,
          {
            cause,
          }
        )
      );
    }
  },
};

export const TOOLS = buildTools(SPEECH_GENERATOR_TOOLS_METADATA, handlers);
