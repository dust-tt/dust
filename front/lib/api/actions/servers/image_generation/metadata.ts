import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const IMAGE_GENERATION_SERVER_NAME = "image_generation" as const;

export const imageGenerationToolInputSchema = z.object({
  prompt: z
    .string()
    .max(4000)
    .describe(
      "Natural language description of the image to generate or edit. Be specific about " +
        "subject, style, colors, lighting, mood, and composition. Examples: " +
        "'a watercolor landscape at sunset', 'a professional headshot on white background', " +
        "'a minimalist tech company logo', 'remove the background and replace with a beach scene'."
    ),
  outputName: z
    .string()
    .max(64)
    .describe(
      "The base name (without file extension) used to save the generated image. " +
        "The extension is appended automatically based on the image format returned " +
        "by the model. Must be 64 characters or less."
    ),
  referenceImages: z
    .array(z.string())
    .max(14)
    .optional()
    .describe(
      "Optional reference images for editing or compositing. Accepts scoped file paths " +
        "(e.g. 'conversation/photo.png') or legacy file sIds. Use to edit photos " +
        "(background removal, color changes, adding elements), combine multiple images, " +
        "apply a style from one image to another, or generate variations of an existing image. " +
        "Supports PNG, JPEG, and WebP. Up to 14 images."
    ),
  aspectRatio: z
    .enum([
      "1:1",
      "3:2",
      "2:3",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "9:16",
      "16:9",
      "21:9",
    ])
    .optional()
    .default("1:1")
    .describe(
      "The aspect ratio of the generated image. Must be one of 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, or 21:9."
    ),
  quality: z
    .enum(["low", "medium"])
    .optional()
    .default("low")
    .describe("Output resolution: low (1K/1024px) or medium (2K/2048px)."),
});

export type ImageGenerationToolInput = z.infer<
  typeof imageGenerationToolInputSchema
>;

export const IMAGE_GENERATION_TOOLS_METADATA = createToolsRecord({
  generate_image: {
    description:
      "Generate, create, draw, or edit images from text prompts and optional reference images. " +
      "Use to produce illustrations, artwork, photos, graphics, diagrams, logos, portraits, " +
      "and any visual content described in natural language. Supports image editing and " +
      "transformation when reference images are provided — e.g., background removal, " +
      "style transfer, compositing scenes, or generating variations of an existing image.",
    schema: imageGenerationToolInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Generating image",
      done: "Generate image",
    },
  },
});

export const IMAGE_GENERATION_SERVER = {
  serverInfo: {
    name: "image_generation",
    version: "1.0.0",
    description:
      "Generate, create, draw, or edit images from text prompts and optional reference images.",
    authorization: null,
    icon: "ActionImageIcon",
    documentationUrl: null,
  },
  tools: Object.values(IMAGE_GENERATION_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(IMAGE_GENERATION_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
