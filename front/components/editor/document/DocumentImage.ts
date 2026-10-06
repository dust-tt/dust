import { isString } from "@app/types/shared/utils/general";
import { Node } from "@tiptap/core";

export const DOCUMENT_IMAGE_NODE_NAME = "image";

const IMAGE_SOURCE_ATTRIBUTE = "data-document-image";

export interface DocumentImageOptions {
  resolveSource: (src: string) => string | null;
}

const escapeAlt = (alt: string) => alt.replace(/[\\[\]]/g, "\\$&");

// A destination with spaces or parentheses only reads back whole between angle brackets.
const destination = (src: string) => (/[\s()]/.test(src) ? `<${src}>` : src);

const imageMarkdown = (src: string, alt: string, title: string | null) =>
  `![${escapeAlt(alt)}](${destination(src)}${
    title ? ` "${title.replace(/["\\]/g, "\\$&")}"` : ""
  })`;

/**
 * @cc [owner:tdraier,label:product;security] document-image-source
 * An image MUST keep its alt text, destination and title through load and save, and MUST be
 * displayed only from the URL `resolveSource` returns for its destination; without one it MUST
 * show as its alt text, so the editor never loads a source the host did not resolve.
 */
export const DocumentImage = Node.create<DocumentImageOptions>({
  name: DOCUMENT_IMAGE_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  addOptions: () => ({ resolveSource: () => null }),
  addAttributes: () => ({
    src: { default: null, rendered: false },
    alt: { default: "", rendered: false },
    title: { default: null, rendered: false },
  }),
  parseHTML: () => [
    {
      tag: `[${IMAGE_SOURCE_ATTRIBUTE}]`,
      getAttrs: (element) => ({
        src: element.getAttribute(IMAGE_SOURCE_ATTRIBUTE),
        alt: element.getAttribute("data-alt") ?? "",
        title: element.getAttribute("title"),
      }),
    },
  ],
  renderHTML({ node }) {
    const { src, alt, title } = node.attrs;
    const attributes = {
      [IMAGE_SOURCE_ATTRIBUTE]: src,
      "data-alt": alt,
      ...(title ? { title } : {}),
    };
    const url = isString(src) ? this.options.resolveSource(src) : null;
    return url
      ? [
          "img",
          {
            ...attributes,
            src: url,
            alt,
            class: "inline-block max-w-full rounded-lg align-bottom",
          },
        ]
      : [
          "span",
          {
            ...attributes,
            class:
              "rounded border border-dashed border-border px-1.5 py-0.5 text-sm text-muted-foreground",
          },
          alt || src || "",
        ];
  },
  parseMarkdown: (token) => ({
    type: DOCUMENT_IMAGE_NODE_NAME,
    attrs: {
      src: token.href,
      alt: token.text ?? "",
      title: token.title ?? null,
    },
  }),
  renderMarkdown: (node) =>
    isString(node.attrs?.src)
      ? imageMarkdown(
          node.attrs.src,
          isString(node.attrs.alt) ? node.attrs.alt : "",
          isString(node.attrs.title) ? node.attrs.title : null
        )
      : "",
});
