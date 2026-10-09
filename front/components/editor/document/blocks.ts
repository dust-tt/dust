import {
  Code01,
  DoubleQuotes,
  Hash01,
  Heading01,
  List,
  Minus,
  Type01,
} from "@dust-tt/sparkle";
import { msg } from "@lingui/core/macro";
import type { ChainedCommands } from "@tiptap/core";
import { isTextSelection } from "@tiptap/core";
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
    name: msg({ message: "Text", context: "document paragraph style" }),
    description: msg`Start writing with plain text`,
    icon: Type01,
    keywords: "paragraph",
    apply: (chain: ChainedCommands) => chain.setParagraph().run(),
  },
  {
    name: msg`Heading 1`,
    description: msg`A big section heading`,
    icon: Heading01,
    keywords: "h1 title",
    apply: (chain: ChainedCommands) => chain.setHeading({ level: 1 }).run(),
  },
  {
    name: msg`Heading 2`,
    description: msg`A medium section heading`,
    icon: Heading01,
    keywords: "h2 subtitle",
    apply: (chain: ChainedCommands) => chain.setHeading({ level: 2 }).run(),
  },
  {
    name: msg`Heading 3`,
    description: msg`A small section heading`,
    icon: Heading01,
    keywords: "h3 subtitle",
    apply: (chain: ChainedCommands) => chain.setHeading({ level: 3 }).run(),
  },
  {
    name: msg`Bulleted list`,
    description: msg`A simple list of ideas`,
    icon: List,
    keywords: "bullet unordered",
    apply: (chain: ChainedCommands) => chain.toggleBulletList().run(),
  },
  {
    name: msg`Numbered list`,
    description: msg`Keep things in order`,
    icon: Hash01,
    keywords: "ordered",
    apply: (chain: ChainedCommands) => chain.toggleOrderedList().run(),
  },
  {
    name: msg({ message: "Quote", context: "document paragraph style" }),
    description: msg`Make a passage stand out`,
    icon: DoubleQuotes,
    keywords: "blockquote",
    apply: (chain: ChainedCommands) => chain.toggleBlockquote().run(),
  },
  {
    name: msg({ message: "Code", context: "document paragraph style" }),
    description: msg`A code snippet`,
    icon: Code01,
    keywords: "codeblock",
    apply: (chain: ChainedCommands) => chain.toggleCodeBlock().run(),
  },
  {
    name: msg`Divider`,
    description: msg`Separate sections`,
    icon: Minus,
    keywords: "line horizontal rule",
    apply: (chain: ChainedCommands) => chain.setHorizontalRule().run(),
  },
];
