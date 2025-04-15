import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import OpenAI from "openai";
import { z } from "zod";

import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { dustManagedCredentials } from "@app/types";

const IMAGE_GENERATION_RATE_LIMITER_KEY = "image_generation";
const IMAGE_GENERATION_RATE_LIMITER_MAX_PER_TIMEFRAME = 800; // Around 100€ / week at 0.12€ / image
const IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS = 60 * 60 * 24 * 7; // 1 week

const serverInfo: InternalMCPServerDefinitionType = {
  name: "image_generation",
  version: "1.0.0",
  description: "Agent can generate images (Dall-E v3).",
  icon: "GithubLogo",
  authorization: null,
};

const createServer = (auth: Authenticator): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "generate_image",
    "Generate an image from a text prompt",
    {
      prompt: z
        .string()
        .max(4000)
        .describe(
          "A text description of the desired image(s). The maximum length is 4000 characters."
        ),
      quality: z
        .enum(["standard", "hd"])
        .optional()
        .default("standard")
        .describe(
          "The quality of the generated images. Must be one of standard or hd"
        ),
      style: z
        .enum(["vivid", "natural"])
        .optional()
        .default("vivid")
        .describe(
          "The style of the generated images. Must be one of vivid or natural"
        ),
      size: z
        .enum(["1024x1024", "1792x1024", "1024x1792"])
        .optional()
        .default("1024x1024")
        .describe(
          "The size of the generated images. Must be one of 1024x1024, 1792x1024, or 1024x1792"
        ),
    },
    async ({ prompt, quality, style, size }) => {
      // Crude way to rate limit the usage of the image generation tool.
      //
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

      const images = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        size,
        quality,
        style,
        response_format: "url",
        user: `workspace-${auth.getNonNullableWorkspace().sId}`,
      });

      const content = images.data.map((image) => ({
        type: "resource" as const,
        resource: {
          mimeType: "image/png",
          uri: image.url!,
          text: `Your image was generated successfully.`,
        },
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
