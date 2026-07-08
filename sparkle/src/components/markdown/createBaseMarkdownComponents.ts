import { BlockquoteBlock } from "@sparkle/components/markdown/BlockquoteBlock";
import { CodeBlockWithExtendedSupport } from "@sparkle/components/markdown/CodeBlockWithExtendedSupport";
import {
  H1Block,
  H2Block,
  H3Block,
  H4Block,
  H5Block,
  H6Block,
} from "@sparkle/components/markdown/HeadingBlock";
import { HrBlock } from "@sparkle/components/markdown/HrBlock";
import { InputBlock } from "@sparkle/components/markdown/InputBlock";
import { LinkBlock } from "@sparkle/components/markdown/LinkBlock";
import { LiBlock, OlBlock, UlBlock } from "@sparkle/components/markdown/List";
import { ParagraphBlock } from "@sparkle/components/markdown/ParagraphBlock";
import { PreBlock } from "@sparkle/components/markdown/PreBlock";
import { StrongBlock } from "@sparkle/components/markdown/StrongBlock";
import {
  TableBlock,
  TableBodyBlock,
  TableDataBlock,
  TableHeadBlock,
  TableHeaderBlock,
} from "@sparkle/components/markdown/TableBlock";
import { pickMarkdownBlock } from "@sparkle/components/markdown/utils";
import type { ComponentType, MemoExoticComponent } from "react";
import type { Components } from "react-markdown";

export function createBaseMarkdownComponents(
  optimizeForStreaming: boolean
): Components {
  const pick = (optimizedBlock: MemoExoticComponent<ComponentType<any>>) =>
    pickMarkdownBlock(optimizedBlock, optimizeForStreaming);

  return {
    pre: pick(PreBlock),
    a: pick(LinkBlock),
    ul: pick(UlBlock),
    ol: pick(OlBlock),
    li: pick(LiBlock),
    p: pick(ParagraphBlock),
    h1: pick(H1Block),
    h2: pick(H2Block),
    h3: pick(H3Block),
    h4: pick(H4Block),
    h5: pick(H5Block),
    h6: pick(H6Block),
    table: pick(TableBlock),
    thead: pick(TableHeadBlock),
    tbody: pick(TableBodyBlock),
    th: pick(TableHeaderBlock),
    td: pick(TableDataBlock),
    strong: pick(StrongBlock),
    input: pick(InputBlock),
    blockquote: pick(BlockquoteBlock),
    hr: pick(HrBlock),
    code: pick(CodeBlockWithExtendedSupport),
  };
}
