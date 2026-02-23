import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getElevenLabsClient,
  resolveDefaultVoiceId,
  streamToBase64,
} from "@app/lib/actions/mcp_internal_actions/servers/elevenlabs/utils";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SPEECH_GENERATOR_TOOLS_METADATA } from "@app/lib/api/actions/servers/speech_generator/metadata";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const handlers: ToolHandlers<typeof SPEECH_GENERATOR_TOOLS_METADATA> = {
  text_to_speech: async ({
    text,
    gender = "female",
    language = "english_american",
    use_case = "conversational",
    name = "speech",
  }) => {
    try {
      const client = getElevenLabsClient();

      const voiceId = resolveDefaultVoiceId({
        language,
        useCase: use_case,
        gender,
      });

      const stream = await client.textToSpeech.convert(voiceId, {
        text,
        enableLogging: false,
        modelId: "eleven_multilingual_v2",
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

      const inputs = dialogues.map((d) => {
        const { gender, language, use_case: useCase } = d.speaker;
        return {
          text: d.text,
          voiceId: resolveDefaultVoiceId({ gender, language, useCase }),
        };
      });

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
