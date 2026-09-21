import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

const decodeHash = (hash: string) => {
  const value = hash.slice(1);

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const getLocalAnchor = (href: string): string | null => {
  if (href.startsWith("#")) {
    return decodeHash(href);
  }

  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }

  if (
    url.origin === window.location.origin &&
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    url.hash
  ) {
    return decodeHash(url.hash);
  }

  return null;
};

const headingDecorations = (doc: Node) => {
  const slugs = new Map<string, number>();
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

    const count = slugs.get(slug) ?? 0;
    slugs.set(slug, count + 1);
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        id: count === 0 ? slug : `${slug}-${count}`,
      })
    );
  });

  return DecorationSet.create(doc, decorations);
};

const followLocalAnchor = (view: EditorView, event: MouseEvent) => {
  const link =
    event.target instanceof Element ? event.target.closest("a") : null;
  const href = link?.getAttribute("href");
  const id = href ? getLocalAnchor(href) : null;

  if (!id || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }

  event.preventDefault();
  const heading = Array.from(
    view.dom.querySelectorAll<HTMLElement>("[id]")
  ).find((element) => element.id === id);
  heading?.scrollIntoView({ block: "start" });
  return true;
};

export const DocumentAnchors = Extension.create({
  name: "documentAnchors",
  priority: 1_000,
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
