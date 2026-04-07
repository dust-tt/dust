import { InstructionBlockBaseNode } from "@app/lib/md-to-html/instructionBlockNode";
import { ListItemExtension } from "@app/lib/md-to-html/listItemExtension";
import type { AnyExtension, Extensions } from "@tiptap/core";
import { Extension, mergeAttributes } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";
import Link from "@tiptap/extension-link";
import { OrderedList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

const BLOCK_ID_ATTRIBUTE = "block-id";

/**
 * Global extension that teaches the static renderer how to render
 * block-id attributes as data-block-id in HTML. The actual ID values
 * are injected into the JSON by addBlockIds() in index.ts, since
 * MarkdownManager.parse() doesn't run ProseMirror attribute defaults.
 */
const BlockIdGlobalExtension = Extension.create({
  name: "blockIdGlobal",

  addGlobalAttributes() {
    return [
      {
        types: [
          "heading",
          "instructionBlock",
          "orderedList",
          "paragraph",
          "bulletList",
        ],
        attributes: {
          [BLOCK_ID_ATTRIBUTE]: {
            default: null,
            renderHTML: (attributes) => {
              if (!attributes[BLOCK_ID_ATTRIBUTE]) {
                return {};
              }
              return {
                [`data-${BLOCK_ID_ATTRIBUTE}`]: attributes[BLOCK_ID_ATTRIBUTE],
              };
            },
          },
        },
      },
    ];
  },
});

/**
 * Builds a server-safe TipTap extension stack for agent instructions.
 * Used by MarkdownManager for markdown→JSON parsing and by the static
 * renderer for JSON→HTML generation.
 *
 * No DOM, React, or browser dependencies required.
 */
export function buildServerSafeExtensions(): Extensions {
  return [
    Markdown,
    StarterKit.configure({
      heading: false,
      hardBreak: false,
      listItem: false,
      orderedList: false,
      link: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
      // Keep default code extension enabled (frontend uses custom CodeExtension
      // for escaped backtick handling, but the default works for server-side).
    }),
    // Override OrderedList to suppress type="null" in static renderer output.
    // The default extension has type with default null, which ProseMirror's DOM
    // serializer omits but the static renderer serializes as the string "null".
    OrderedList.extend({
      renderHTML({ HTMLAttributes }) {
        const { start, type, ...rest } = HTMLAttributes;
        const attrs = { ...rest };
        if (start !== 1) {
          attrs.start = start;
        }
        if (type !== null && type !== undefined) {
          attrs.type = type;
        }
        return ["ol", mergeAttributes(this.options.HTMLAttributes, attrs), 0];
      },
    }),
    ListItemExtension,
    InstructionBlockBaseNode,
    BlockIdGlobalExtension,
    Heading.configure({
      levels: [1, 2, 3, 4, 5, 6],
    }),
    // Override Link to suppress title="null" in static renderer output
    // (same null-attribute issue as OrderedList).
    Link.extend({
      renderHTML({ HTMLAttributes }) {
        const { title, ...rest } = HTMLAttributes;
        const attrs = { ...rest };
        if (title !== null && title !== undefined) {
          attrs.title = title;
        }
        return ["a", mergeAttributes(this.options.HTMLAttributes, attrs), 0];
      },
    }).configure({
      autolink: false,
      openOnClick: false,
    }),
  ] as AnyExtension[];
}
