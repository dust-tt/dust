import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getElevenLabsClient,
  streamToBase64,
} from "@app/lib/actions/mcp_internal_actions/servers/elevenlabs/utils";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SOUND_STUDIO_TOOLS_METADATA } from "@app/lib/api/actions/servers/sound_studio/metadata";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const handlers: ToolHandlers<typeof SOUND_STUDIO_TOOLS_METADATA> = {
  generate_sound_effects: async ({
    prompt,
    duration_s = 3,
    loop = true,
    name = "sfx",
  }) => {
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
            _meta: {
              text: "Your sound effect was generated successfully.",
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
          `Error generating sound effect with ElevenLabs: ${cause.message}`,
          {
            cause,
          }
        )
      );
    }
  },
};

export const TOOLS = buildTools(SOUND_STUDIO_TOOLS_METADATA, handlers);
