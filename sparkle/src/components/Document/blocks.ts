import {
  Code01,
  DoubleQuotes,
  Hash01,
  Heading01,
  List,
  Minus,
  Type01,
} from "@sparkle/icons/v2-stroke";
import { type ChainedCommands, isTextSelection } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

export const getBlockQuery = (state: EditorState) => {
  const { selection } = state;
  if (!isTextSelection(selection) || !selection.empty) {
    return null;
  }
  const { $from } = selection;
  if ($from.depth !== 1 || $from.parent.type.name !== "paragraph") {
    return null;
  }
  const text = $from.parent.textBetween(0, $from.parentOffset);
  const match = /^\/([\w ]*)$/.exec(text);
  return match ? { from: $from.start(), to: $from.pos, query: match[1] } : null;
};

export const BLOCKS = [
  {
    name: "Text",
    description: "Start writing with plain text",
    icon: Type01,
    keywords: "paragraph",
    apply: (chain: ChainedCommands) => chain.setParagraph().run(),
  },
  {
    name: "Heading 1",
    description: "A big section heading",
    icon: Heading01,
    keywords: "h1 title",
    apply: (chain: ChainedCommands) => chain.setHeading({ level: 1 }).run(),
  },
  {
    name: "Heading 2",
    description: "A medium section heading",
    icon: Heading01,
    keywords: "h2 subtitle",
    apply: (chain: ChainedCommands) => chain.setHeading({ level: 2 }).run(),
  },
  {
    name: "Heading 3",
    description: "A small section heading",
    icon: Heading01,
    keywords: "h3 subtitle",
    apply: (chain: ChainedCommands) => chain.setHeading({ level: 3 }).run(),
  },
  {
    name: "Bulleted list",
    description: "A simple list of ideas",
    icon: List,
    keywords: "bullet unordered",
    apply: (chain: ChainedCommands) => chain.toggleBulletList().run(),
  },
  {
    name: "Numbered list",
    description: "Keep things in order",
    icon: Hash01,
    keywords: "ordered",
    apply: (chain: ChainedCommands) => chain.toggleOrderedList().run(),
  },
  {
    name: "Quote",
    description: "Make a passage stand out",
    icon: DoubleQuotes,
    keywords: "blockquote",
    apply: (chain: ChainedCommands) => chain.toggleBlockquote().run(),
  },
  {
    name: "Code",
    description: "A block of code",
    icon: Code01,
    keywords: "codeblock",
    apply: (chain: ChainedCommands) => chain.toggleCodeBlock().run(),
  },
  {
    name: "Divider",
    description: "Separate sections",
    icon: Minus,
    keywords: "line horizontal rule",
    apply: (chain: ChainedCommands) => chain.setHorizontalRule().run(),
  },
];
