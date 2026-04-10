import { HeadingExtension } from "@app/components/editor/extensions/HeadingExtension";
import { BlockIdExtension } from "@app/components/editor/extensions/instructions/BlockIdExtension";
import { InstructionsDocumentExtension } from "@app/components/editor/extensions/instructions/InstructionsDocumentExtension";
import { InstructionsRootExtension } from "@app/components/editor/extensions/instructions/InstructionsRootExtension";
import { KnowledgeNode } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import { markdownStyles } from "@dust-tt/sparkle";
import type { Extensions } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

/**
 * Build the TipTap extension list for the skill instructions editor.
 *
 * @param isReadOnly - When true, only the base parsing/rendering extensions are
 *   included. When false, caller must supply `editableExtensions` with the
 *   browser-only extensions (SlashCommand, Placeholder, CharacterCount, etc.)
 *   that cannot be statically imported in server/Node contexts.
 * @param editableExtensions - Extensions appended when `isReadOnly` is false.
 */
export function buildSkillInstructionsExtensions(
  isReadOnly: boolean,
  editableExtensions: Extensions = []
): Extensions {
  const baseExtensions: Extensions = [
    InstructionsDocumentExtension,
    InstructionsRootExtension,
    Markdown,
    StarterKit.configure({
      document: false,
      orderedList: {
        HTMLAttributes: {
          class: markdownStyles.orderedList(),
        },
      },
      listItem: {
        HTMLAttributes: {
          class: markdownStyles.list(),
        },
      },
      bulletList: {
        HTMLAttributes: {
          class: markdownStyles.unorderedList(),
        },
      },
      blockquote: false,
      horizontalRule: false,
      strike: false,
      heading: false,
      code: {
        HTMLAttributes: {
          class: markdownStyles.codeBlock(),
        },
      },
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
    HeadingExtension.configure({
      levels: [1, 2, 3],
      HTMLAttributes: {
        class: "mt-4 mb-3",
      },
    }),
    BlockIdExtension,
    KnowledgeNode,
  ];

  if (!isReadOnly) {
    baseExtensions.push(...editableExtensions);
  }

  return baseExtensions;
}
