import { InstructionSuggestionExtension } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { CodeExtension } from "@app/components/editor/extensions/CodeExtension";
import { HeadingExtension } from "@app/components/editor/extensions/HeadingExtension";
import { SkillNode } from "@app/components/editor/extensions/input_bar/SkillNode";
import { BlockIdExtension } from "@app/components/editor/extensions/instructions/BlockIdExtension";
import { InstructionsDocumentExtension } from "@app/components/editor/extensions/instructions/InstructionsDocumentExtension";
import { InstructionsRootExtension } from "@app/components/editor/extensions/instructions/InstructionsRootExtension";
import { LinkExtension } from "@app/components/editor/extensions/LinkExtension";
import { ListItemExtension } from "@app/components/editor/extensions/ListItemExtension";
import { KnowledgeNodeWithView } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeWithView";
import {
  RawMarkdownBlock,
  rawMarkdownBlockParsers,
} from "@app/components/editor/extensions/skill_builder/RawMarkdownBlock";
import { ToolNodeWithView } from "@app/components/editor/extensions/skill_builder/ToolNodeWithView";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { markdownStyles } from "@dust-tt/sparkle";
import type { Extensions } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

/**
 * - "editable": full editing experience.
 * - "readOnly": non-editable; knowledge chips stay interactive (links, icons).
 * - "suggestion": non-editable diff presentation; knowledge nodes render as
 *   static chips so suggestion decorations apply to them.
 */
export type SkillInstructionsEditorMode =
  | "editable"
  | "readOnly"
  | "suggestion";

interface BuildSkillInstructionsExtensionsOptions {
  mode?: SkillInstructionsEditorMode;
  editableExtensions?: Extensions;
  onSkillNodeDetails?: (skillId: string) => void;
  onToolDetails?: (tool: MCPServerViewType) => void;
}

/**
 * Build the TipTap extension list for the skill instructions editor.
 *
 * @param options.mode - "readOnly" omits interactive editing extensions;
 *   "suggestion" renders knowledge nodes as static suggestion
 *   chips. Defaults to "editable".
 * @param options.editableExtensions - Extensions appended in "editable" mode
 *   only.
 */
export function buildSkillInstructionsExtensions({
  mode = "editable",
  editableExtensions = [],
  onSkillNodeDetails,
  onToolDetails,
}: BuildSkillInstructionsExtensionsOptions = {}): Extensions {
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
    KnowledgeNodeWithView.configure({ isSuggestion: mode === "suggestion" }),
    ToolNodeWithView.configure({ onToolDetails }),
    SkillNode.configure({ onSkillDetails: onSkillNodeDetails }),
  ];

  baseExtensions.push(
    InstructionSuggestionExtension.configure({ showBlockHighlight: false }),
    RawMarkdownBlock,
    ...rawMarkdownBlockParsers
  );

  if (mode === "editable") {
    baseExtensions.push(...editableExtensions);
  }

  return baseExtensions;
}
