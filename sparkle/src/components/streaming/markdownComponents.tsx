import React, { useMemo } from "react";
import type { Components } from "react-markdown";
import { ParagraphBlock } from "@sparkle/components/markdown/ParagraphBlock";
import { OlBlock, UlBlock } from "@sparkle/components/markdown/List";
import {
  TableBlock,
  TableHeadBlock,
  TableBodyBlock,
  TableHeaderBlock,
  TableDataBlock,
} from "@sparkle/components/markdown/TableBlock";
import { BlockquoteBlock } from "@sparkle/components/markdown/BlockquoteBlock";
import { CodeBlockWithExtendedSupport } from "@sparkle/components/markdown/CodeBlockWithExtendedSupport";
import { PreBlock } from "@sparkle/components/markdown/PreBlock";
import {
  Input,
  LinkBlock,
  StrongBlock,
  HrBlock,
  ImgBlock,
} from "@sparkle/components/markdown/Markdown";
import { cn } from "@sparkle/lib/utils";

import type { ComponentProps, ProcessChildrenContext } from "./types";
import { MARKDOWN_TEXT_SIZES } from "./types";
import { BlockStreamer } from "./BlockStreamer";
import {
  keyOf,
  flatten,
  isReactElementWithProps,
  getElementProps,
} from "./utils";
import { StreamingListItem } from "./StreamingListItem";
import { StreamingParagraph } from "@sparkle/components/streaming/StreamingParagraph";

interface CreateMarkdownComponentsParams {
  textColor: string;
  forcedTextSize?: string;
  additionalMarkdownComponents?: Components;
  processContext: ProcessChildrenContext;
}

export function createMarkdownComponents({
  textColor,
  forcedTextSize,
  additionalMarkdownComponents,
  processContext,
}: CreateMarkdownComponentsParams): Components {
  const {
    isStreaming,
    animationName,
    animationDuration,
    animationTimingFunction,
  } = processContext;
  const sizes = MARKDOWN_TEXT_SIZES;

  return {
    // Let parent blocks handle animation to keep identity stable
    text: ({ node, ...props }: ComponentProps) => props.children,

    h1: ({ node, ...props }: ComponentProps) => {
      const text = flatten(props.children);
      return (
        <h1
          key={keyOf(node, "h1")}
          className={cn("s-pb-2 s-pt-4", forcedTextSize || sizes.h1, textColor)}
          {...props}
        >
          <BlockStreamer
            text={text}
            animate={isStreaming}
            animationName={animationName}
            animationDuration={animationDuration}
            animationTimingFunction={animationTimingFunction}
          />
        </h1>
      );
    },

    h2: ({ node, ...props }: ComponentProps) => {
      const text = flatten(props.children);
      return (
        <h2
          key={keyOf(node, "h2")}
          className={cn("s-pb-2 s-pt-4", forcedTextSize || sizes.h2, textColor)}
          {...props}
        >
          <BlockStreamer
            text={text}
            animate={isStreaming}
            animationName={animationName}
            animationDuration={animationDuration}
            animationTimingFunction={animationTimingFunction}
          />
        </h2>
      );
    },

    h3: ({ node, ...props }: ComponentProps) => {
      const text = flatten(props.children);
      return (
        <h3
          key={keyOf(node, "h3")}
          className={cn("s-pb-2 s-pt-4", forcedTextSize || sizes.h3, textColor)}
          {...props}
        >
          <BlockStreamer
            text={text}
            animate={isStreaming}
            animationName={animationName}
            animationDuration={animationDuration}
            animationTimingFunction={animationTimingFunction}
          />
        </h3>
      );
    },

    h4: ({ node, ...props }: ComponentProps) => {
      const text = flatten(props.children);
      return (
        <h4
          key={keyOf(node, "h4")}
          className={cn("s-pb-2 s-pt-3", forcedTextSize || sizes.h4, textColor)}
          {...props}
        >
          <BlockStreamer
            text={text}
            animate={isStreaming}
            animationName={animationName}
            animationDuration={animationDuration}
            animationTimingFunction={animationTimingFunction}
          />
        </h4>
      );
    },

    h5: ({ node, ...props }: ComponentProps) => {
      const text = flatten(props.children);
      return (
        <h5
          key={keyOf(node, "h5")}
          className={cn(
            "s-pb-1.5 s-pt-2.5",
            forcedTextSize || sizes.h5,
            textColor
          )}
          {...props}
        >
          <BlockStreamer
            text={text}
            animate={isStreaming}
            animationName={animationName}
            animationDuration={animationDuration}
            animationTimingFunction={animationTimingFunction}
          />
        </h5>
      );
    },

    h6: ({ node, ...props }: ComponentProps) => {
      const text = flatten(props.children);
      return (
        <h6
          key={keyOf(node, "h6")}
          className={cn(
            "s-pb-1.5 s-pt-2.5",
            forcedTextSize || sizes.h6,
            textColor
          )}
          {...props}
        >
          <BlockStreamer
            text={text}
            animate={isStreaming}
            animationName={animationName}
            animationDuration={animationDuration}
            animationTimingFunction={animationTimingFunction}
          />
        </h6>
      );
    },

    p: ({ node, ...props }: ComponentProps) => (
      <StreamingParagraph
        {...props}
        isStreaming={isStreaming}
        animationName={animationName}
        animationDuration={animationDuration}
        animationTimingFunction={animationTimingFunction}
        textColor={textColor}
        forcedTextSize={forcedTextSize}
        sizes={sizes}
      />
    ),
    blockquote: ({ node, ...props }: ComponentProps) => (
      <BlockquoteBlock>{props.children}</BlockquoteBlock>
    ),

    ul: ({ node, ...props }: ComponentProps) => (
      <UlBlock textColor={textColor} textSize={forcedTextSize || sizes.p}>
        {props.children}
      </UlBlock>
    ),

    ol: ({ node, start, ...props }: ComponentProps & { start?: number }) => (
      <OlBlock
        start={start}
        textColor={textColor}
        textSize={forcedTextSize || sizes.p}
      >
        {props.children}
      </OlBlock>
    ),

    li: (
      props: ComponentProps & {
        ordered?: boolean;
        index?: number;
        checked?: boolean | null;
      }
    ) => (
      <StreamingListItem
        {...props}
        isStreaming={isStreaming}
        animationName={animationName}
        animationDuration={animationDuration}
        animationTimingFunction={animationTimingFunction}
        textColor={textColor}
        forcedTextSize={forcedTextSize}
        sizes={sizes}
      />
    ),

    a: ({ node, ...props }: ComponentProps & { href?: string }) => (
      <LinkBlock href={props.href}>{props.children}</LinkBlock>
    ),

    strong: ({ node, ...props }: ComponentProps) => (
      <StrongBlock>{props.children}</StrongBlock>
    ),

    em: ({ node, ...props }: ComponentProps) => (
      <em {...props}>{props.children}</em>
    ),

    pre: ({ children }: { children?: React.ReactNode }) => (
      <PreBlock>{children}</PreBlock>
    ),

    code: CodeBlockWithExtendedSupport,

    hr: HrBlock,

    img: ImgBlock,

    table: TableBlock,
    thead: TableHeadBlock,
    tbody: TableBodyBlock,
    th: TableHeaderBlock,
    td: ({ node, ...props }: ComponentProps) => {
      const text = flatten(props.children);
      return (
        <TableDataBlock>
          <BlockStreamer
            text={text}
            animate={isStreaming}
            animationName={animationName}
            animationDuration={animationDuration}
            animationTimingFunction={animationTimingFunction}
          />
        </TableDataBlock>
      );
    },
    input: Input,
    ...additionalMarkdownComponents,
  };
}
