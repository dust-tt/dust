import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getElevenLabsClient,
  resolveDefaultVoiceId,
  streamToBase64,
} from "@app/lib/actions/mcp_internal_actions/servers/elevenlabs/utils";
import {
  SPEECH_GENERATOR_TOOL_NAME,
  textToDialogueSchema,
  textToSpeechSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/speech_generator/metadata";
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
    textToSpeechSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: `${SPEECH_GENERATOR_TOOL_NAME}_text_to_speech`,
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
    textToDialogueSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: `${SPEECH_GENERATOR_TOOL_NAME}_text_to_dialogue`,
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
