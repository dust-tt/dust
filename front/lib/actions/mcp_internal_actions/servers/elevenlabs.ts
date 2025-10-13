import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { ElevenLabsEnvironment } from "@elevenlabs/elevenlabs-js/environments";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  makeInternalMCPServer,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { dustManagedCredentials, normalizeError } from "@app/types";

function getElevenLabsClient() {
  const credentials = dustManagedCredentials();
  const environment =
    regionsConfig.getCurrentRegion() === "europe-west1"
      ? ElevenLabsEnvironment.ProductionEu
      : ElevenLabsEnvironment.ProductionUs;

  return new ElevenLabsClient({
    apiKey: credentials.ELEVENLABS_API_KEY,
    environment,
  });
}

async function streamToBase64(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  // Convert a web ReadableStream to a base64 string.
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

const VOICE_TO_VOICE_ID = {
  female: "cgSgspJ2msm6clMCkdW9",
  male: "bIHbv24MWmeRgasZH58o",
};

const createServer = (_auth: Authenticator): McpServer => {
  const server = makeInternalMCPServer("elevenlabs");

  server.tool(
    "text_to_speech",
    "Generate speech audio from a text prompt using ElevenLabs. Provide the desired voice.",
    {
      text: z
        .string()
        .min(1)
        .max(10_000)
        .describe("The text to convert to speech."),
      voice: z
        .enum(["female", "male"])
        .default("female")
        .describe(
          "The ElevenLabs voice to use. Possible options are female, or male."
        ),
      name: z
        .string()
        .max(128)
        .optional()
        .default("speech")
        .describe("Base filename (without extension) for the generated audio."),
    },
    async ({ text, voice = "female", name = "speech" }) => {
      try {
        const client = getElevenLabsClient();
        const voiceId = VOICE_TO_VOICE_ID[voice];

        const stream = await client.textToSpeech.convert(voiceId, {
          text,
          enableLogging: false,
          modelId: "eleven_multilingual_v2",
          outputFormat: "mp3_44100_128",
        });

        const base64 = await streamToBase64(stream);
        const fileName = `${name}.mp3`;

        return {
          isError: false,
          content: [
            {
              type: "resource" as const,
              resource: {
                name: fileName,
                blob: base64,
                text: "Your audio file was generated successfully.",
                mimeType: "audio/mpeg",
                uri: "",
              },
            },
          ],
        };
      } catch (e) {
        logger.error(
          { err: normalizeError(e) },
          "Error generating text-to-speech with ElevenLabs."
        );
        return makeMCPToolTextError(
          `Error generating speech audio with ElevenLabs: ${normalizeError(e).message}`
        );
      }
    }
  );

  server.tool(
    "generate_music",
    "Generate a short music track from a prompt using ElevenLabs Music.",
    {
      prompt: z
        .string()
        .min(1)
        .max(2000)
        .describe(
          "Describe the style and mood of the music to generate (eg: 'energetic electronic beat with ambient pads')."
        ),
      duration_ms: z
        .number()
        .int()
        .min(3000)
        .max(120000)
        .optional()
        .default(20000)
        .describe(
          "Target duration of the generated music in milliseconds (3s to 120s)."
        ),
      name: z
        .string()
        .max(128)
        .optional()
        .default("music")
        .describe("Base filename (without extension) for the generated audio."),
    },
    async ({ prompt, duration_ms = 20000, name = "music" }) => {
      try {
        const client = getElevenLabsClient();

        const stream = await client.music.compose({
          prompt,
          musicLengthMs: duration_ms,
        });

        const base64 = await streamToBase64(stream);

        return {
          isError: false,
          content: [
            {
              type: "resource" as const,
              resource: {
                name: `${name}.mp3`,
                blob: base64,
                text: "Your music track was generated successfully.",
                mimeType: "audio/mpeg",
                uri: "",
              },
            },
          ],
        };
      } catch (e) {
        logger.error(
          { err: normalizeError(e) },
          "Error generating music with ElevenLabs."
        );
        return makeMCPToolTextError(
          `Error generating music with ElevenLabs: ${normalizeError(e).message}`
        );
      }
    }
  );

  return server;
};

export default createServer;
