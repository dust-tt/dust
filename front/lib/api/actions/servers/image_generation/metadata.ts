import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const IMAGE_GENERATION_SERVER_NAME = "image_generation" as const;

export const IMAGE_GENERATION_TOOLS_METADATA = createToolsRecord({
  generate_image: {
    description:
      "Generate an image from text descriptions. The more detailed and specific your prompt is, the" +
      " better the result will be. You can customize the output through various parameters to" +
      " match your needs.",
    schema: {
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
    stake: "low",
  },
  edit_image: {
    description:
      "Edit an existing image using text instructions. Provide the file ID of an image from Dust" +
      " file storage and describe the changes you want to make. The tool preserves the original" +
      " image's aspect ratio by default, but you can optionally change it.",
    schema: {
      imageFileId: z
        .string()
        .describe(
          "The ID of the image file to edit (e.g. fil_abc1234) from conversation attachments. Must be a valid image file (PNG, JPEG, etc.)."
        ),
      editPrompt: z
        .string()
        .max(4000)
        .describe(
          "A text description of the desired edits. Be specific about what should change and what should remain unchanged. The maximum length is 4000 characters."
        ),
      outputName: z
        .string()
        .max(64)
        .describe(
          "The filename that will be used to save the edited image. Must be 64 characters or less."
        ),
      quality: z
        .enum(["auto", "low", "medium", "high"])
        .optional()
        .default("auto")
        .describe(
          "The quality of the edited image. Must be one of auto, low, medium, or high. Auto" +
            " will automatically choose the best quality."
        ),
      aspectRatio: z
        .enum(["1:1", "3:2", "2:3"])
        .optional()
        .describe(
          "Optional aspect ratio override for the edited image. If not specified, preserves the" +
            " original aspect ratio."
        ),
    },
    stake: "low",
  },
});

export const IMAGE_GENERATION_SERVER = {
  serverInfo: {
    name: "image_generation",
    version: "1.0.0",
    description:
      "Create or edit visual content from text descriptions and images.",
    authorization: null,
    icon: "ActionImageIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(IMAGE_GENERATION_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(IMAGE_GENERATION_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
