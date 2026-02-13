import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const IMAGE_GENERATION_SERVER_NAME = "image_generation" as const;

export const IMAGE_GENERATION_TOOLS_METADATA = createToolsRecord({
  generate_image: {
    description:
      "Generate or edit images from text descriptions and reference images.",
    schema: {
      prompt: z
        .string()
        .max(4000)
        .describe("A text description of the desired image."),
      outputName: z
        .string()
        .max(64)
        .describe(
          "The filename that will be used to save the generated image. Must be 64 characters or less."
        ),
      referenceImages: z
        .array(z.string())
        .max(14)
        .optional()
        .describe(
          "Optional file IDs of reference images from conversation attachments. Up to 14 reference images."
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
        .enum(["low", "medium", "high"])
        .optional()
        .default("low")
        .describe(
          "Output resolution: low (1K/1024px), medium (2K/2048px), or high (4K/4096px)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Generating image",
      done: "Generate image",
    },
  },
});

const IMAGE_GENERATION_SERVER_INSTRUCTIONS =
  "Use generate_image to create images from text or transform existing images.\n\n" +
  "GENERATION FROM TEXT:\n" +
  "- Provide a detailed prompt describing the desired image\n" +
  "- Be very specific about style, composition, colors, lighting, and mood\n" +
  "- In most usecases, medium quality is enough\n\n" +
  "REFERENCE IMAGES:\n" +
  "- For object inclusion: up to 6 images to reproduce objects with high fidelity\n" +
  "- For human consistency: up to 5 images to maintain character appearance\n" +
  "- Maximum 14 total reference images can be combined\n" +
  "- Supported formats: PNG, JPEG, WebP, HEIC, HEIF\n\n" +
  "IMAGE EDITING:\n" +
  "- Provide the source image as reference and describe the desired changes\n" +
  "- Example: 'Remove the background and replace it with a sunset beach scene'\n\n" +
  "COMPOSITION:\n" +
  "- Combine multiple reference images into a new scene\n" +
  "- Describe how elements should be arranged in the prompt\n\n" +
  "TOOL CHAINING:\n" +
  "- Images from previous tool calls can be used as reference for subsequent generations\n" +
  "- Example: generate a character portrait, then use it as reference for different poses\n\n" +
  "OUTPUT OPTIONS:\n" +
  "- Quality: 'low' (1K), 'medium' (2K), or 'high' (4K)\n" +
  "- Aspect ratios: 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9";

export const IMAGE_GENERATION_SERVER = {
  serverInfo: {
    name: "image_generation",
    version: "1.0.0",
    description:
      "Generate or edit images from text descriptions and reference images.",
    authorization: null,
    icon: "ActionImageIcon",
    documentationUrl: null,
    // Predates the introduction of the rule, would require extensive work to
    // improve, already widely adopted.
    // eslint-disable-next-line dust/no-mcp-server-instructions
    instructions: IMAGE_GENERATION_SERVER_INSTRUCTIONS,
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
