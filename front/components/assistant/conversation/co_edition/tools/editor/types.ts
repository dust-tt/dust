import { z } from "zod";

// Base node type.
const BaseNodeSchema = z.object({
  type: z.string(),
});

// Text node type.
const CoEditionTextNodeSchema = BaseNodeSchema.extend({
  type: z.literal("text"),
  content: z
    .string()
    .describe(
      "The content of the text node. This can be:\n" +
        "1. Plain text (e.g. 'Hello world')\n" +
        "2. HTML content (e.g. '<p>Hello <strong>world</strong></p>')\n" +
        "3. Multiple HTML blocks (e.g. '<h1>Title</h1><p>Paragraph</p>')\n\n" +
        "IMPORTANT:\n" +
        "- Markdown is NOT supported\n" +
        "- The HTML must be valid and properly closed\n" +
        "- Subsequent/Successive blocks should be properly separated"
    ),
});

// Image node type.
const CoEditionImageNodeSchema = BaseNodeSchema.extend({
  type: z.literal("image"),
  fileId: z
    .string()
    // Note: We use regex instead of startsWith because this schema is converted to JSON Schema
    // and validated by AJV, which requires regex patterns for string validation.
    // Using startsWith would cause "Invalid escape" errors in AJV.
    .regex(/^fil_\w+/, { message: "File ID must start with 'fil_'" })
    .describe("The file ID of the image to insert (starts with 'fil_')"),
  alt: z.string().optional().describe("Optional alt text for the image"),
});

export type CoEditionTextNode = z.infer<typeof CoEditionTextNodeSchema>;
export type CoEditionImageNode = z.infer<typeof CoEditionImageNodeSchema>;

// Content schema for the editor.
export const CoEditionContentSchema = z.union([
  CoEditionTextNodeSchema,
  CoEditionImageNodeSchema,
]);
export type CoEditionContent = z.infer<typeof CoEditionContentSchema>;
