import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import OpenAI from "openai";
import { z } from "zod";

import type { MCPToolResultContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { uploadBase64ImageToFileStorage } from "@app/lib/api/files/upload";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { dustManagedCredentials, Err } from "@app/types";

const IMAGE_GENERATION_RATE_LIMITER_KEY = "image_generation";
const IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS = 60 * 60 * 24 * 7; // 1 week.

// By default, OpenAI returns a PNG image.
const DEFAULT_IMAGE_OUTPUT_FORMAT = "png";
const DEFAULT_IMAGE_MIME_TYPE = "image/png";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "image_generation",
  version: "1.0.0",
  description: "Agent can generate images (GPT Image 1).",
  icon: "ActionImageIcon",
  authorization: null,
};

const createServer = (auth: Authenticator): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "generate_image",
    "Generate an image from text descriptions. The more detailed and specific your prompt is, the" +
      " better the result will be. You can customize the output through various parameters to" +
      " match your needs.",
    {
      prompt: z
        .string()
        .max(4000)
        .describe(
          "A text description of the desired image. The maximum length is 32000 characters."
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
          "The quality of the generated image. Must be one of auto, low, medium, or high. Auto" +
            " will automatically choose the best quality for the size."
        ),
      size: z
        .enum(["1024x1024", "1536x1024", "1024x1536"])
        .optional()
        .default("1024x1024")
        .describe(
          "The size of the generated image. Must be one of 1024x1024, 1536x1024, or 1024x1536"
        ),
    },
    async ({ prompt, name, quality, size }) => {
      const workspace = auth.getNonNullableWorkspace();

      const { limits } = auth.getNonNullablePlan();
      const { maxImagesPerWeek } = limits.capabilities.images;

      // Check current usage for the week.
      const remaining = await rateLimiter({
        key: `${IMAGE_GENERATION_RATE_LIMITER_KEY}_${workspace.sId}`,
        maxPerTimeframe: maxImagesPerWeek,
        timeframeSeconds: IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS,
        logger,
      });

      const statsDClient = getStatsDClient();
      statsDClient.increment("tools.image_generation.generated", 1, [
        `quality:${quality}`,
        `size:${size}`,
      ]);

      if (remaining <= 0) {
        statsDClient.increment("tools.image_generation.rate_limit_hit", 1);

        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `Rate limit of ${maxImagesPerWeek} requests per week exceeded. Contact your ` +
                "administrator to increase the limit.",
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
        moderation: "low",
        output_format: DEFAULT_IMAGE_OUTPUT_FORMAT,
        prompt,
        quality,
        size,
        user: `workspace-${workspace.sId}`,
      });

      statsDClient.increment(
        "tools.image_generation.usage.input_tokens",
        result.usage?.input_tokens ?? 0
      );
      statsDClient.increment(
        "tools.image_generation.usage.output_tokens",
        result.usage?.output_tokens ?? 0
      );

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

      const fileName = `${name}.${DEFAULT_IMAGE_OUTPUT_FORMAT}`;

      const fileResults = await concurrentExecutor(
        result.data,
        async (image) => {
          try {
            const res = await uploadBase64ImageToFileStorage(auth, {
              base64: image.b64_json!,
              contentType: DEFAULT_IMAGE_MIME_TYPE,
              fileName,
            });

            return res;
          } catch (error) {
            logger.error(
              {
                action: "mcp_tool",
                tool: "generate_image",
                workspaceId: workspace.sId,
                error,
              },
              "Failed to save the generated image."
            );

            return new Err("Failed to save the generated image.");
          }
        },
        { concurrency: 10 }
      );

      const errors = fileResults.filter((r) => r.isErr());
      if (errors.length > 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to generate image: ${errors.map((e) => e.error).join(", ")}`,
            },
          ],
        };
      }

      const content: MCPToolResultContentType[] = fileResults
        .filter((f) => f.isOk())
        .map(({ value: file }) => ({
          type: "resource",
          resource: {
            contentType: file.contentType,
            fileId: file.sId,
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
            snippet: null,
            text: "Your image was generated successfully.",
            title: file.fileName,
            uri: file.getPublicUrl(auth),
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
