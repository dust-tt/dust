// Server-side variant of buildSkillInstructionsExtensions. Mirrors the editor
// builder but uses schema-only TipTap extensions and avoids React/sparkle
// imports, so it can be loaded by server and worker code (e.g.
// skill_instructions_html) without dragging the editor's React NodeView chain
// or @dust-tt/sparkle into the import graph (the worker bundle forbids sparkle).
import { InstructionSuggestionExtension } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { CodeExtension } from "@app/components/editor/extensions/CodeExtension";
import { BlockIdExtension } from "@app/components/editor/extensions/instructions/BlockIdExtension";
import { InstructionsDocumentExtension } from "@app/components/editor/extensions/instructions/InstructionsDocumentExtension";
import { InstructionsRootExtension } from "@app/components/editor/extensions/instructions/InstructionsRootExtension";
import { ListItemExtension } from "@app/components/editor/extensions/ListItemExtension";
import { KnowledgeNode } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import {
  RawMarkdownBlock,
  rawMarkdownBlockParsers,
} from "@app/components/editor/extensions/skill_builder/RawMarkdownBlock";
import { ToolNode } from "@app/components/editor/extensions/skill_builder/ToolNode";
import { LinkExtension } from "@app/components/editor/input_bar/LinkExtension";
import type { Extensions } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";
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
    // Use the plain TipTap Heading (not HeadingExtension) here: HeadingExtension
    // imports markdownHeaderClasses from @dust-tt/sparkle, which is forbidden in
    // the worker bundle. Server-side rendering strips presentation attributes
    // anyway (see stripPresentationAttributes in skill_instructions_html.ts), so
    // the sparkle-derived classes would be removed regardless.
    Heading.configure({
      levels: [1, 2, 3, 4, 5, 6],
    }),
    BlockIdExtension,
    KnowledgeNode.configure({ readOnly: true }),
    ToolNode,
    InstructionSuggestionExtension.configure({ showBlockHighlight: false }),
    RawMarkdownBlock,
    ...rawMarkdownBlockParsers,
  ];
}
