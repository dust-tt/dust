import { GoogleGenAI } from "@google/genai";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { dustManagedCredentials, Err, Ok } from "@app/types";
import { GEMINI_2_5_FLASH_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";

const IMAGE_GENERATION_RATE_LIMITER_KEY = "image_generation";
const IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS = 60 * 60 * 24 * 7; // 1 week.

const DEFAULT_IMAGE_OUTPUT_FORMAT = "png";
const DEFAULT_IMAGE_MIME_TYPE = "image/png";

// Map tool size parameters to Gemini aspect ratios.
const SIZE_TO_ASPECT_RATIO: Record<string, string> = {
  "1024x1024": "1:1",
  "1536x1024": "3:2",
  "1024x1536": "2:3",
};

const GeminiInlineDataPartSchema = z.object({
  inlineData: z.object({
    data: z.string(),
    mimeType: z.string().optional(),
  }),
});

type GeminiInlineDataPart = z.infer<typeof GeminiInlineDataPartSchema>;

// Type guard to validate Gemini inline data parts.
function isValidGeminiInlineDataPart(
  part: unknown
): part is GeminiInlineDataPart {
  return GeminiInlineDataPartSchema.safeParse(part).success;
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("image_generation");

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
        .max(64)
        .describe(
          "The filename that will be used to save the generated image. Must be 64 characters or less."
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: "generate_image", agentLoopContext },
      async ({ prompt, name, quality, size }, { sendNotification, _meta }) => {
        const workspace = auth.getNonNullableWorkspace();

        if (_meta?.progressToken) {
          const notification: MCPProgressNotificationType = {
            method: "notifications/progress",
            params: {
              progress: 0,
              total: 1,
              progressToken: _meta?.progressToken,
              data: {
                label: "Generating image...",
                output: {
                  type: "image",
                  mimeType: DEFAULT_IMAGE_MIME_TYPE,
                },
              },
            },
          };

          // Send a notification to the MCP Client, to display a placeholder for the image.
          await sendNotification(notification);
        }

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
          `provider:gemini`,
        ]);

        if (remaining <= 0) {
          statsDClient.increment("tools.image_generation.rate_limit_hit", 1, [
            `provider:gemini`,
          ]);

          return new Err(
            new MCPError(
              `Rate limit of ${maxImagesPerWeek} requests per week exceeded. Contact your ` +
                "administrator to increase the limit.",
              {
                tracked: false,
              }
            )
          );
        }

        try {
          const credentials = dustManagedCredentials();

          const gemini = new GoogleGenAI({
            apiKey: credentials.GOOGLE_AI_STUDIO_API_KEY,
          });

          const aspectRatio =
            SIZE_TO_ASPECT_RATIO[size] || SIZE_TO_ASPECT_RATIO["1024x1024"];

          const response = await gemini.models.generateContent({
            model: GEMINI_2_5_FLASH_IMAGE_MODEL_ID,
            contents: prompt,
            config: {
              temperature: 0.7,
              responseModalities: ["IMAGE"],
              candidateCount: 1,
              imageConfig: {
                aspectRatio,
              },
            },
          });

          if (!response.candidates || response.candidates.length === 0) {
            // Check if prompt was blocked by safety filters
            if (response.promptFeedback?.blockReason) {
              logger.error(
                {
                  blockReason: response.promptFeedback.blockReason,
                  safetyRatings: response.promptFeedback.safetyRatings,
                  prompt,
                },
                "Gemini image generation: Prompt blocked by safety filters"
              );
              return new Err(
                new MCPError(
                  `Image generation blocked by safety filters: ${response.promptFeedback.blockReason}`
                )
              );
            }
            return new Err(new MCPError("No image generated."));
          }

          const content = response.candidates[0].content;

          if (!content || !content.parts) {
            return new Err(new MCPError("No image data in response"));
          }

          const imageParts = content.parts.filter(isValidGeminiInlineDataPart);

          if (imageParts.length === 0) {
            return new Err(new MCPError("No image data in response."));
          }

          statsDClient.increment(
            "tools.image_generation.usage.input_tokens",
            response.usageMetadata?.promptTokenCount ?? 0,
            [`provider:gemini`]
          );
          statsDClient.increment(
            "tools.image_generation.usage.output_tokens",
            response.usageMetadata?.candidatesTokenCount ?? 0,
            [`provider:gemini`]
          );

          const fileName = `${name}.${DEFAULT_IMAGE_OUTPUT_FORMAT}`;

          return new Ok(
            imageParts.map((part) => ({
              type: "image" as const,
              mimeType: part.inlineData.mimeType ?? DEFAULT_IMAGE_MIME_TYPE,
              data: part.inlineData.data,
              name: fileName,
            }))
          );
        } catch (error) {
          logger.error(
            {
              error,
            },
            "Error generating image."
          );
          return new Err(new MCPError("Error generating image."));
        }
      }
    )
  );

  return server;
}

export default createServer;
