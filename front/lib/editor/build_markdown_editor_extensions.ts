import { CodeExtension } from "@app/components/editor/extensions/CodeExtension";
import { EmojiExtension } from "@app/components/editor/extensions/EmojiExtension";
import { HeadingExtension } from "@app/components/editor/extensions/HeadingExtension";
import { ListItemExtension } from "@app/components/editor/extensions/ListItemExtension";
import {
  RawMarkdownBlock,
  rawMarkdownBlockParsers,
} from "@app/components/editor/extensions/skill_builder/RawMarkdownBlock";
import { BlockquoteExtension } from "@app/components/editor/input_bar/BlockquoteExtension";
import { LinkExtension } from "@app/components/editor/input_bar/LinkExtension";
import { markdownStyles } from "@dust-tt/sparkle";
import type { Extensions } from "@tiptap/core";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

/** Markdown token types handled natively; the rest fall through to RawMarkdownBlock. */
const NATIVE_MARKDOWN_TOKEN_TYPES = new Set(["hr", "blockquote"]);

const rawMarkdownBlockParsersForUnhandledTokens =
  rawMarkdownBlockParsers.filter(
    (extension) =>
      !NATIVE_MARKDOWN_TOKEN_TYPES.has(
        extension.name.replace("rawMarkdownBlock_", "")
      )
  );

export interface BuildMarkdownEditorExtensionsOptions {
  placeholder?: string;
  maxCharacterCount?: number;
}

/**
 * TipTap extension list for the generic markdown editor.
 * Supports standard markdown formatting (headings, lists, code, links, emoji,
 * blockquotes, horizontal rules). Unhandled markdown tokens (tables, link
 * definitions) are preserved as opaque raw blocks via RawMarkdownBlock.
 */
export function buildMarkdownEditorExtensions({
  placeholder,
  maxCharacterCount,
}: BuildMarkdownEditorExtensionsOptions = {}): Extensions {
  const extensions: Extensions = [
    Markdown,
    StarterKit.configure({
      heading: false,
      hardBreak: false,
      paragraph: {
        HTMLAttributes: {
          class: markdownStyles.paragraph(),
        },
      },
      orderedList: {
        HTMLAttributes: {
          class: markdownStyles.orderedList(),
        },
      },
      listItem: false,
      link: false,
      bulletList: {
        HTMLAttributes: {
          class: markdownStyles.unorderedList(),
        },
      },
      blockquote: false,
      horizontalRule: {
        HTMLAttributes: {
          class:
            "my-4 border-0 border-t border-border dark:border-border-night",
        },
      },
      strike: false,
      undoRedo: {
        depth: 100,
      },
      code: false,
      codeBlock: {
        HTMLAttributes: {
          class: markdownStyles.codeBlock(),
        },
      },
    }),
    CodeExtension.configure({
      HTMLAttributes: {
        class: markdownStyles.codeInline(),
      },
    }),
    ListItemExtension.configure({
      HTMLAttributes: {
        class: markdownStyles.list(),
      },
    }),
    HeadingExtension.configure({
      levels: [1, 2, 3, 4, 5, 6],
      HTMLAttributes: { class: "mt-4 mb-3" },
    }),
    BlockquoteExtension.configure({
      HTMLAttributes: {
        class: markdownStyles.blockquote(),
      },
    }),
    EmojiExtension,
    LinkExtension.configure({
      HTMLAttributes: {
        class: "text-blue-600 hover:underline hover:text-blue-800",
      },
      autolink: false,
      openOnClick: false,
    }),
    RawMarkdownBlock,
    ...rawMarkdownBlockParsersForUnhandledTokens,
  ];

  if (placeholder) {
    extensions.push(
      Placeholder.configure({
        placeholder,
        emptyNodeClass:
          "first:before:text-gray-400 dark:first:before:text-gray-500 first:before:italic first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:absolute",
      })
    );
  }

  if (maxCharacterCount !== undefined) {
    extensions.push(
      CharacterCount.configure({
        limit: maxCharacterCount,
      })
    );
  }

  return extensions;
}
