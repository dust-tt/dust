// Server-side variant of buildSkillInstructionsExtensions. Mirrors the editor
// builder but uses schema-only TipTap extensions and skips React/sparkle
// imports, so it can be loaded by server code (e.g. skill_instructions_html)
// without dragging the editor's React NodeView chain into the import graph.
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
import type { Extensions } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

// Server-side rendering strips presentation attributes from the output HTML
// (see stripPresentationAttributes in skill_instructions_html.ts), so the
// editor's markdownStyles classes would be removed anyway. Omit them here
// to avoid importing @dust-tt/sparkle.
export function buildSkillInstructionsExtensionsForServer(): Extensions {
  return [
    InstructionsDocumentExtension,
    InstructionsRootExtension,
    Markdown.configure(),
    StarterKit.configure({
      // document: false is required because InstructionsDocumentExtension
      // replaces StarterKit's default Document node.
      document: false,
      listItem: false,
      link: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
      heading: false,
      code: false,
    }),
    CodeExtension,
    ListItemExtension,
    LinkExtension.configure({
      autolink: false,
      openOnClick: false,
    }),
    HeadingExtension.configure({
      levels: [1, 2, 3, 4, 5, 6],
    }),
    BlockIdExtension,
    KnowledgeNode.configure({ readOnly: true }),
    InstructionSuggestionExtension.configure({ showBlockHighlight: false }),
    RawMarkdownBlock,
    ...rawMarkdownBlockParsers,
  ];
}
