import { InstructionSuggestionExtension } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { CodeExtension } from "@app/components/editor/extensions/CodeExtension";
import { HeadingExtension } from "@app/components/editor/extensions/HeadingExtension";
import { BlockIdExtension } from "@app/components/editor/extensions/instructions/BlockIdExtension";
import { InstructionsDocumentExtension } from "@app/components/editor/extensions/instructions/InstructionsDocumentExtension";
import { InstructionsRootExtension } from "@app/components/editor/extensions/instructions/InstructionsRootExtension";
import { ListItemExtension } from "@app/components/editor/extensions/ListItemExtension";
import { KnowledgeNode } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import {
  RawMarkdownBlock,
  rawMarkdownBlockParsers,
} from "@app/components/editor/extensions/skill_builder/RawMarkdownBlock";
import { LinkExtension } from "@app/components/editor/input_bar/LinkExtension";
import { markdownStyles } from "@dust-tt/sparkle";
import type { Extensions } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

/**
 * Build the TipTap extension list for the skill instructions editor.
 *
 * @param isReadOnly - When true, interactive editing extensions are omitted.
 * @param editableExtensions - Extensions appended when `isReadOnly` is false.
 */
export function buildSkillInstructionsExtensions(
  isReadOnly: boolean,
  editableExtensions: Extensions = []
): Extensions {
  const baseExtensions: Extensions = [
    InstructionsDocumentExtension,
    InstructionsRootExtension,
    Markdown.configure(),
    StarterKit.configure({
      // document: false is required because InstructionsDocumentExtension
      // replaces StarterKit's default Document node.
      document: false,
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
      horizontalRule: false,
      strike: false,
      heading: false,
      code: false,
      codeBlock: {
        HTMLAttributes: {
          class: markdownStyles.codeBlock(),
        },
      },
      paragraph: {
        HTMLAttributes: {
          class: markdownStyles.paragraph(),
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
    LinkExtension.configure({
      autolink: false,
      openOnClick: false,
    }),
    HeadingExtension.configure({
      levels: [1, 2, 3, 4, 5, 6],
      HTMLAttributes: {
        class: "mt-4 mb-3",
      },
    }),
    BlockIdExtension,
    KnowledgeNode.configure({ readOnly: isReadOnly }),
    InstructionSuggestionExtension.configure({ showBlockHighlight: false }),
    RawMarkdownBlock,
    ...rawMarkdownBlockParsers,
  ];

  if (!isReadOnly) {
    baseExtensions.push(...editableExtensions);
  }

  return baseExtensions;
}
