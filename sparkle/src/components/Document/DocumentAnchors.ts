import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

// TipTap's Link extension opens tabs on mouseup at priority 1,000.
const DOCUMENT_ANCHOR_PRIORITY = 1_001;
const URL_HASH_PREFIX = "#";

const getHeadingIdFromHash = (hash: string): string => {
  const encodedHeadingId = hash.slice(URL_HASH_PREFIX.length);

  try {
    return decodeURIComponent(encodedHeadingId);
  } catch {
    return encodedHeadingId;
  }
};

const getLocalHeadingId = (href: string): string | null => {
  if (href.startsWith(URL_HASH_PREFIX)) {
    return getHeadingIdFromHash(href);
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(href, window.location.href);
  } catch {
    return null;
  }

  const pointsToCurrentPage =
    targetUrl.origin === window.location.origin &&
    targetUrl.pathname === window.location.pathname &&
    targetUrl.search === window.location.search;

  if (!pointsToCurrentPage || !targetUrl.hash) {
    return null;
  }

  return getHeadingIdFromHash(targetUrl.hash);
};

/**
 * @cc [owner:flvndvd,label:product] document-unique-heading-ids
 * Heading IDs MUST be unique within a document, including collisions between
 * literal heading slugs and IDs generated for duplicate headings.
 */
const headingDecorations = (doc: Node) => {
  const nextSuffixBySlug = new Map<string, number>();
  const usedHeadingIds = new Set<string>();
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") {
      return;
    }

    const slug = node.textContent
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");

    if (!slug) {
      return;
    }

    let headingId = slug;
    let suffix = nextSuffixBySlug.get(slug) ?? 1;

    while (usedHeadingIds.has(headingId)) {
      headingId = `${slug}-${suffix}`;
      suffix += 1;
    }

    usedHeadingIds.add(headingId);
    nextSuffixBySlug.set(slug, suffix);
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        id: headingId,
      })
    );
  });

  return DecorationSet.create(doc, decorations);
};

const followLocalAnchor = (view: EditorView, event: MouseEvent) => {
  const link =
    event.target instanceof Element ? event.target.closest("a") : null;
  const href = link?.getAttribute("href");
  const headingId = href ? getLocalHeadingId(href) : null;

  if (
    !headingId ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  event.preventDefault();

  const heading = Array.from(
    view.dom.querySelectorAll<HTMLElement>("[id]")
  ).find((element) => element.id === headingId);
  heading?.scrollIntoView({
    block: "start",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });

  return true;
};

/**
 * @cc [owner:flvndvd,label:product] document-local-anchor-navigation
 * Unmodified primary clicks on local heading links MUST scroll within this document
 * without opening a tab or changing the URL, in both editable and read-only modes.
 * Scrolling MUST be smooth unless the user prefers reduced motion.
 */
export const DocumentAnchors = Extension.create({
  name: "documentAnchors",
  priority: DOCUMENT_ANCHOR_PRIORITY,
  addProseMirrorPlugins: () => [
    new Plugin({
      state: {
        init: (_, state) => headingDecorations(state.doc),
        apply: (transaction, decorations) =>
          transaction.docChanged
            ? headingDecorations(transaction.doc)
            : decorations,
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
        handleClick: (view, _pos, event) => followLocalAnchor(view, event),
        handleDOMEvents: { click: followLocalAnchor },
      },
    }),
  ],
});
