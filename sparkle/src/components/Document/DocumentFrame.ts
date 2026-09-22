import { Node } from "@tiptap/core";
import { z } from "zod";

export const DOCUMENT_MAX_FRAMES = 10;

const MAX_FRAME_PATH_LENGTH = 2_048;
const MAX_FRAME_TITLE_LENGTH = 200;

const framePath = z
  .string()
  .max(MAX_FRAME_PATH_LENGTH)
  .regex(/^(?:conversation|pod)-[A-Za-z0-9]+\/.+/)
  .refine(
    (path) =>
      !/[\\\u0000-\u001f\u007f]/.test(path) &&
      path
        .split("/")
        .every(
          (segment) => segment !== "" && segment !== "." && segment !== ".."
        ),
    "Use a canonical Files path without traversal."
  );
const frameTitle = z.string().min(1).max(MAX_FRAME_TITLE_LENGTH).nullable();

export const DocumentFrameReferenceSchema = z
  .object({
    src: framePath,
    title: frameTitle.default(null),
  })
  .strict();
export type DocumentFrameReference = z.infer<
  typeof DocumentFrameReferenceSchema
>;

/**
 * @cc [owner:flvndvd,label:security] document-frame-reference
 * Frame blocks MUST store only a canonical Files reference and an optional title.
 * They MUST NOT accept executable content, remote iframe URLs or sandbox settings.
 * Resolving access and mounting the existing Frame host belong to the trusted consumer.
 */
export const DocumentFrame = Node.create({
  name: "dustFrame",
  group: "block",
  atom: true,
  isolating: true,
  draggable: true,

  addAttributes: () => ({
    src: {
      default: null,
      parseHTML: (element) => element.getAttribute("data-dust-frame"),
      validate: framePath.parse,
    },
    title: {
      default: null,
      parseHTML: (element) => element.getAttribute("data-dust-frame-title"),
      validate: frameTitle.parse,
    },
  }),

  parseHTML: () => [
    {
      tag: "div[data-dust-frame]",
      getAttrs: (element) => {
        const reference = DocumentFrameReferenceSchema.safeParse({
          src: element.getAttribute("data-dust-frame"),
          title: element.getAttribute("data-dust-frame-title"),
        });
        return reference.success ? reference.data : false;
      },
    },
  ],

  renderHTML: ({ node }) => {
    const reference = DocumentFrameReferenceSchema.safeParse(node.attrs);
    if (!reference.success) {
      return ["div", "Frame unavailable"];
    }
    return [
      "div",
      {
        "data-dust-frame": reference.data.src,
        "data-dust-frame-title": reference.data.title,
      },
      reference.data.title ?? "Frame",
    ];
  },
});
