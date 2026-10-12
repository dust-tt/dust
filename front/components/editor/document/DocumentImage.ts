import { isString } from "@app/types/shared/utils/general";
import { Node } from "@tiptap/core";
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { DOMSerializer } from "@tiptap/pm/model";

export const DOCUMENT_IMAGE_NODE_NAME = "image";

export const IMAGE_SOURCE_ATTRIBUTE = "data-document-image";
const IMAGE_WIDTH_ATTRIBUTE = "data-width";

export interface DocumentImageOptions {
  resolveSource: (src: string) => string | null;
}

const escapeAlt = (alt: string) => alt.replace(/[\\[\]]/g, "\\$&");

// The width follows the alt text after a pipe, as Obsidian writes it: `![Chart|400](chart.png)`.
// Alt text that itself ends with a pipe and digits escapes that pipe.
const ALT_WITH_WIDTH = /^([\s\S]*?)(\\?)\|([1-9]\d*)$/;

const altWithWidth = (alt: string, width: number | null) =>
  width !== null
    ? `${escapeAlt(alt)}|${width}`
    : escapeAlt(alt).replace(/\|([1-9]\d*)$/, "\\|$1");

const parseAltWithWidth = (
  text: string
): { alt: string; width: number | null } => {
  const match = ALT_WITH_WIDTH.exec(text);
  if (!match) {
    return { alt: text, width: null };
  }
  const [, alt, escaped, width] = match;
  return escaped
    ? { alt: `${alt}|${width}`, width: null }
    : { alt, width: Number(width) };
};

export const parseImageWidth = (value: unknown): number | null => {
  const width = typeof value === "number" ? value : Number(value);
  return Number.isInteger(width) && width > 0 ? width : null;
};

// A destination with spaces or parentheses only reads back whole between angle brackets.
const destination = (src: string) => (/[\s()]/.test(src) ? `<${src}>` : src);

const imageMarkdown = (
  src: string,
  alt: string,
  title: string | null,
  width: number | null
) =>
  `![${altWithWidth(alt, width)}](${destination(src)}${
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
  const width = parseImageWidth(node.attrs.width);
  const attributes = {
    [IMAGE_SOURCE_ATTRIBUTE]: src,
    "data-alt": alt,
    ...(title ? { title } : {}),
    ...(width ? { [IMAGE_WIDTH_ATTRIBUTE]: String(width) } : {}),
  };
  const url = isString(src) ? resolveSource(src) : null;
  return url
    ? [
        "img",
        {
          ...attributes,
          src: url,
          alt,
          ...(width ? { style: `width: ${width}px` } : {}),
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
 * An image MUST keep its alt text, destination, title and width through load and save, and MUST
 * be displayed only from the URL `resolveSource` returns for its destination; without one it
 * MUST show as text, its alt text or its destination when the alt text is empty, so the editor
 * never loads a source the host did not resolve. Copied and pasted, it MUST keep its destination.
 * In the editor, a resolved image MUST show as busy until it loads or fails.
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
    width: {
      default: null,
      rendered: false,
      parseHTML: (element) =>
        parseImageWidth(element.getAttribute(IMAGE_WIDTH_ATTRIBUTE)),
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
      ...parseAltWithWidth(token.text ?? ""),
      title: token.title ?? null,
    },
  }),
  renderMarkdown: (node) =>
    isString(node.attrs?.src)
      ? imageMarkdown(
          node.attrs.src,
          isString(node.attrs.alt) ? node.attrs.alt : "",
          isString(node.attrs.title) ? node.attrs.title : null,
          parseImageWidth(node.attrs.width)
        )
      : "",
});
