// Server-side variant of the agent builder's editor extensions
// (`buildAgentInstructionsReadOnlyExtensions`): the same schema, with schema-only nodes and no
// React or sparkle imports, so server code can convert agent instructions between markdown and
// block HTML. Agent instructions differ from skill ones by the `instructionBlock` sections
// (`<role>…</role>`), which the skill schema treats as plain text.
import { InstructionBlockNode } from "@app/components/editor/extensions/agent_builder/InstructionBlockNode";
import { CodeExtension } from "@app/components/editor/extensions/CodeExtension";
import { BlockIdExtension } from "@app/components/editor/extensions/instructions/BlockIdExtension";
import { InstructionsDocumentExtension } from "@app/components/editor/extensions/instructions/InstructionsDocumentExtension";
import { InstructionsRootExtension } from "@app/components/editor/extensions/instructions/InstructionsRootExtension";
import { LinkExtension } from "@app/components/editor/extensions/LinkExtension";
import { ListItemExtension } from "@app/components/editor/extensions/ListItemExtension";
import type { Extensions } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

export function buildAgentInstructionsExtensionsForServer(): Extensions {
  return [
    Markdown.configure(),
    InstructionsDocumentExtension,
    StarterKit.configure({
      // document: false is required because InstructionsDocumentExtension
      // replaces StarterKit's default Document node.
      document: false,
      heading: false,
      hardBreak: false,
      listItem: false,
      link: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
      code: false,
    }),
    CodeExtension,
    ListItemExtension,
    InstructionsRootExtension,
    BlockIdExtension,
    InstructionBlockNode,
    // Plain TipTap Heading rather than HeadingExtension, which imports sparkle; presentation
    // attributes are stripped from the rendered HTML anyway.
    Heading.configure({
      levels: [1, 2, 3, 4, 5, 6],
    }),
    LinkExtension.configure({
      autolink: false,
      openOnClick: false,
    }),
  ];
}
