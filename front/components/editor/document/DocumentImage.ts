import { isString } from "@app/types/shared/utils/general";
import { Node } from "@tiptap/core";
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { DOMSerializer } from "@tiptap/pm/model";

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

const LOADING_CLASSES = [
  "min-h-8",
  "min-w-8",
  "animate-pulse",
  "bg-muted-background",
];

const imageSpec = (
  node: ProseMirrorNode,
  resolveSource: DocumentImageOptions["resolveSource"]
): DOMOutputSpec => {
  const { src, alt, title } = node.attrs;
  const attributes = {
    [IMAGE_SOURCE_ATTRIBUTE]: src,
    "data-alt": alt,
    ...(title ? { title } : {}),
  };
  const url = isString(src) ? resolveSource(src) : null;
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
};

/**
 * @cc [owner:tdraier,label:product;security] document-image-source
 * An image MUST keep its alt text, destination and title through load and save, and MUST be
 * displayed only from the URL `resolveSource` returns for its destination; without one it MUST
 * show as text, its alt text or its destination when the alt text is empty, so the editor never
 * loads a source the host did not resolve. Copied and pasted, it MUST keep its destination. In
 * the editor, a resolved image MUST show as busy until it loads or fails.
 */
export const DocumentImage = Node.create<DocumentImageOptions>({
  name: DOCUMENT_IMAGE_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  addOptions: () => ({ resolveSource: () => null }),
  // Each attribute reads its own HTML attribute: the displayed `src` is a resolved URL, never
  // the destination to save.
  addAttributes: () => ({
    src: {
      default: null,
      rendered: false,
      parseHTML: (element) => element.getAttribute(IMAGE_SOURCE_ATTRIBUTE),
    },
    alt: {
      default: "",
      rendered: false,
      parseHTML: (element) => element.getAttribute("data-alt") ?? "",
    },
    title: {
      default: null,
      rendered: false,
      parseHTML: (element) => element.getAttribute("title"),
    },
  }),
  parseHTML: () => [{ tag: `[${IMAGE_SOURCE_ATTRIBUTE}]` }],
  renderHTML({ node }) {
    return imageSpec(node, this.options.resolveSource);
  },
  addNodeView() {
    return ({ node }) => {
      const { dom } = DOMSerializer.renderSpec(
        document,
        imageSpec(node, this.options.resolveSource)
      );
      if (dom instanceof HTMLImageElement && !dom.complete) {
        dom.classList.add(...LOADING_CLASSES);
        dom.setAttribute("aria-busy", "true");
        const loaded = () => {
          dom.classList.remove(...LOADING_CLASSES);
          dom.removeAttribute("aria-busy");
        };
        dom.addEventListener("load", loaded, { once: true });
        dom.addEventListener("error", loaded, { once: true });
      }
      return { dom };
    };
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
