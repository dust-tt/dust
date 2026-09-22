import type { Attributes } from "@tiptap/core";
import { Link } from "@tiptap/extension-link";
import { Plugin } from "@tiptap/pm/state";
import { z } from "zod";

const MAX_LINK_LENGTH = 4_096;
const MAX_LINK_TITLE_LENGTH = 1_024;
const LINK_ATTRIBUTES = {
  target: "_blank",
  rel: "noopener noreferrer",
  class:
    "underline decoration-foreground/35 underline-offset-4 transition-colors hover:decoration-current motion-reduce:transition-none",
};
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

const isAllowedLink = (href: string): boolean => {
  if (href.trim() !== href || /[\u0000-\u001f\u007f\\]/.test(href)) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(href, "https://document.invalid");
  } catch {
    return false;
  }

  return ALLOWED_PROTOCOLS.has(url.protocol);
};

const linkHref = z.string().min(1).max(MAX_LINK_LENGTH).refine(isAllowedLink);
const linkTitle = z.string().max(MAX_LINK_TITLE_LENGTH).nullable();

/**
 * @cc [owner:flvndvd,label:security] document-link-policy
 * Document content MUST NOT control link targets, rel or CSS classes. Links MUST use
 * HTTP, HTTPS, mailto, tel or relative URLs, and new tabs MUST have no opener.
 */
export const DocumentLink = Link.extend({
  addAttributes() {
    const attributes: Attributes = this.parent?.() ?? {};

    return {
      href: { ...attributes.href, validate: linkHref.parse },
      title: { ...attributes.title, validate: linkTitle.parse },
      target: {
        default: LINK_ATTRIBUTES.target,
        parseHTML: () => LINK_ATTRIBUTES.target,
        validate: z.literal(LINK_ATTRIBUTES.target).parse,
      },
      rel: {
        default: LINK_ATTRIBUTES.rel,
        parseHTML: () => LINK_ATTRIBUTES.rel,
        validate: z.literal(LINK_ATTRIBUTES.rel).parse,
      },
      class: {
        default: LINK_ATTRIBUTES.class,
        parseHTML: () => LINK_ATTRIBUTES.class,
        validate: z.literal(LINK_ATTRIBUTES.class).parse,
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const href = linkHref.safeParse(HTMLAttributes.href);
    const title = linkTitle.safeParse(HTMLAttributes.title ?? null);

    return [
      "a",
      {
        ...LINK_ATTRIBUTES,
        href: href.success ? href.data : "",
        title: title.success ? title.data : null,
      },
      0,
    ];
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        props: {
          handleClick: (view, _position, event) => {
            if (!view.editable || event.button !== 0) {
              return false;
            }

            const link =
              event.target instanceof Element
                ? event.target.closest("a")
                : null;
            const href = linkHref.safeParse(link?.getAttribute("href"));

            if (!link || !view.dom.contains(link) || !href.success) {
              return false;
            }

            event.preventDefault();
            window.open(href.data, "_blank", "noopener,noreferrer");
            return true;
          },
        },
      }),
    ];
  },
}).configure({
  openOnClick: false,
  HTMLAttributes: LINK_ATTRIBUTES,
  isAllowedUri: (href) => linkHref.safeParse(href).success,
});
