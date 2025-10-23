import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getElevenLabsClient,
  streamToBase64,
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
  const server = makeInternalMCPServer("sound_studio");

  server.tool(
    "generate_music",
    "Generate a short music track from a prompt.",
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
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "elevenlabs_generate_music",
        agentLoopContext,
      },
      async ({ prompt, duration_ms = 20000, name = "music" }) => {
        try {
          const client = getElevenLabsClient();

          const stream = await client.music.compose({
            prompt,
            musicLengthMs: duration_ms,
          });

          const base64 = await streamToBase64(stream);

          return new Ok([
            {
              type: "resource" as const,
              resource: {
                name: `${name}.mp3`,
                blob: base64,
                text: "Your music track was generated successfully.",
                mimeType: "audio/mpeg",
                uri: `${name}.mp3`,
              },
            },
          ]);
        } catch (e) {
          const cause = normalizeError(e);
          return new Err(
            new MCPError(
              `Error generating music with ElevenLabs: ${cause.message}`,
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
    "generate_sound_effects",
    "Generate a short sound effect from a text prompt.",
    {
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
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "elevenlabs_generate_sound_effects",
        agentLoopContext,
      },
      async ({ prompt, duration_s = 3, loop = true, name = "sfx" }) => {
        try {
          const client = getElevenLabsClient();

          const stream = await client.textToSoundEffects.convert({
            text: prompt,
            durationSeconds: duration_s,
            loop,
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
                text: "Your sound effect was generated successfully.",
                mimeType: "audio/mpeg",
                uri: fileName,
              },
            },
          ]);
        } catch (e) {
          const cause = normalizeError(e);
          return new Err(
            new MCPError(
              `Error generating sound effect with ElevenLabs: ${cause.message}`,
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
