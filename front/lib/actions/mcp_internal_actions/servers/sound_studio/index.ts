import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getElevenLabsClient,
  streamToBase64,
} from "@app/lib/actions/mcp_internal_actions/servers/elevenlabs/utils";
import {
  generateSoundEffectsSchema,
  SOUND_STUDIO_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/sound_studio/metadata";
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
    "generate_sound_effects",
    "Generate a short sound effect from a text prompt.",
    generateSoundEffectsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: `${SOUND_STUDIO_TOOL_NAME}_generate_sound_effects`,
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
