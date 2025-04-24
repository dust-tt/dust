import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import OpenAI from "openai";
import { z } from "zod";

import type { MCPToolResultContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { dustManagedCredentials } from "@app/types";

const IMAGE_GENERATION_RATE_LIMITER_KEY = "image_generation";
const IMAGE_GENERATION_RATE_LIMITER_MAX_PER_TIMEFRAME = 800; // Around 100€ / week at 0.12€ / image
const IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS = 60 * 60 * 24 * 7; // 1 week

// By default, OpenAI returns a PNG image.
const DEFAULT_IMAGE_OUTPUT_FORMAT = "png";
const DEFAULT_IMAGE_MIME_TYPE = "image/png";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "image_generation",
  version: "1.0.0",
  description: "Agent can generate images (Dall-E v3).",
  icon: "ActionImageIcon",
  authorization: null,
};

const createServer = (auth: Authenticator): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "generate_image",
    "Generate an image in PNG format from a text prompt",
    {
      prompt: z
        .string()
        .max(4000)
        .describe(
          "A text description of the desired image(s). The maximum length is 4000 characters."
        ),
      name: z
        .string()
        .max(32)
        .describe(
          "The name of the image. The maximum length is 32 characters."
        ),
      quality: z
        .enum(["auto", "low", "medium", "high"])
        .optional()
        .default("auto")
        .describe(
          "The quality of the generated images. Must be one of auto, low, medium, or high. Auto" +
            " will automatically choose the best quality for the size."
        ),
      size: z
        .enum(["1024x1024", "1536x1024", "1024x1536"])
        .optional()
        .default("1024x1024")
        .describe(
          "The size of the generated images. Must be one of 1024x1024, 1536x1024, or 1024x1536"
        ),
    },
    async ({ prompt, name, quality, size }) => {
      // Crude way to rate limit the usage of the image generation tool.
      const remaining = await rateLimiter({
        key: `${IMAGE_GENERATION_RATE_LIMITER_KEY}_${auth.getNonNullableWorkspace().sId}`,
        maxPerTimeframe: IMAGE_GENERATION_RATE_LIMITER_MAX_PER_TIMEFRAME,
        timeframeSeconds: IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS,
        logger,
      });

      if (remaining <= 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Rate limit of 800 requests per week exceeded. Contact your administrator to increase the limit.",
            },
          ],
        };
      }

      const credentials = dustManagedCredentials();
      const openai = new OpenAI({
        apiKey: credentials.OPENAI_API_KEY,
      });

      const result = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        quality,
        size,
        user: `workspace-${auth.getNonNullableWorkspace().sId}`,
        output_format: DEFAULT_IMAGE_OUTPUT_FORMAT,
      });

      const fileName = `${name}.${DEFAULT_IMAGE_OUTPUT_FORMAT}`;

      if (!result.data) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "No image generated.",
            },
          ],
        };
      }

      const content: MCPToolResultContentType[] = result.data.map((image) => ({
        type: "image",
        data: image.b64_json!,
        mimeType: DEFAULT_IMAGE_MIME_TYPE,
        fileName,
      }));

      return {
        isError: false,
        content,
      };
    }
  );

  return server;
};

export default createServer;
