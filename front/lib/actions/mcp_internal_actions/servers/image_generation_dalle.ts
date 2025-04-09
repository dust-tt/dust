import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import OpenAI from "openai";
import { z } from "zod";

import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { dustManagedCredentials } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "image_generation_dalle",
  version: "1.0.0",
  description: "Generate images with the Dall-E v3 model from OpenAI.",
  icon: "image",
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
          text: `Here is the image's url: ${image.url}`,
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
