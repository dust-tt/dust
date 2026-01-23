import { blockquoteVariants } from "@sparkle/components/markdown/BlockquoteBlock";
import {
  codeBlockVariants,
  codeInlineVariants,
} from "@sparkle/components/markdown/CodeBlock";
import {
  liBlockVariants,
  olBlockVariants,
  ulBlockVariants,
} from "@sparkle/components/markdown/List";
import { paragraphBlockVariants } from "@sparkle/components/markdown/ParagraphBlock";
import { preBlockVariants } from "@sparkle/components/markdown/PreBlock";

// This exports markdown styles for all components.
// It is used in the InputBar component.
export const markdownStyles = {
  blockquote: blockquoteVariants,
  codeInline: codeInlineVariants,
  codeBlock: codeBlockVariants,
  list: liBlockVariants,
  orderedList: olBlockVariants,
  paragraph: paragraphBlockVariants,
  pre: preBlockVariants,
  unorderedList: ulBlockVariants,
};
