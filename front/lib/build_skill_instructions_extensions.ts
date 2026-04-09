import { AgentInstructionDiffExtension } from "@app/components/editor/extensions/agent_builder/AgentInstructionDiffExtension";
import { HeadingExtension } from "@app/components/editor/extensions/HeadingExtension";
import { BlockIdExtension } from "@app/components/editor/extensions/instructions/BlockIdExtension";
import { InstructionsDocumentExtension } from "@app/components/editor/extensions/instructions/InstructionsDocumentExtension";
import { InstructionsRootExtension } from "@app/components/editor/extensions/instructions/InstructionsRootExtension";
import { KnowledgeNode } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import { SlashCommandExtension } from "@app/components/editor/extensions/skill_builder/SlashCommandExtension";
import { markdownStyles } from "@dust-tt/sparkle";
import type { Extensions } from "@tiptap/core";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

export function buildSkillInstructionsExtensions(
  isReadOnly: boolean
): Extensions {
  const baseExtensions: Extensions = [
    InstructionsDocumentExtension,
    InstructionsRootExtension,
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
    Markdown,
    BlockIdExtension,
    KnowledgeNode,
  ];

  if (!isReadOnly) {
    baseExtensions.push(
      SlashCommandExtension,
      AgentInstructionDiffExtension,
      Placeholder.configure({
        placeholder: "What does this skill do? How should it behave?",
        emptyNodeClass:
          "first:before:text-gray-400 first:before:italic first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:absolute",
      }),
      CharacterCount.configure({
        limit: INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
      })
    );
  }

  return baseExtensions;
}
