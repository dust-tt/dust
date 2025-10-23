import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getElevenLabsClient,
  resolveDefaultVoiceId,
  streamToBase64,
  VOICE_GENDERS,
  VOICE_LANGUAGES,
  VOICE_USE_CASES,
} from "@app/lib/actions/mcp_internal_actions/servers/elevenlabs/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, normalizeError, Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("speech_generator");

  server.tool(
    "text_to_speech",
    "Generate speech audio from a text prompt with desired voice.",
    {
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
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "elevenlabs_text_to_speech",
        agentLoopContext,
      },
      async ({
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
                text: "Your audio file was generated successfully.",
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
      }
    )
  );

  server.tool(
    "text_to_dialogue",
    "Generate dialogue audio from multiple lines with speakers.",
    {
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
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "elevenlabs_text_to_dialogue",
        agentLoopContext,
      },
      async ({ dialogues, name = "dialogue" }) => {
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
                text: "Your dialogue audio file was generated successfully.",
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
      }
    )
  );

  return server;
}

export default createServer;
