import React, { useMemo } from "react";
import type { Components } from "react-markdown";
import { ParagraphBlock } from "@sparkle/components/markdown/ParagraphBlock";
import { UlBlock, OlBlock, LiBlock } from "@sparkle/components/markdown/List";
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

  const createBlockStreamer = (text: string, key?: string | number) => (
    <BlockStreamer
      key={key}
      text={text}
      animate={isStreaming}
      animationName={animationName}
      animationDuration={animationDuration}
      animationTimingFunction={animationTimingFunction}
    />
  );

  // Generic heading component factory
  const createHeadingComponent = (
    level: 1 | 2 | 3 | 4 | 5 | 6,
    className: string
  ) => {
    return ({ node, ...props }: ComponentProps) => {
      const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
      const bk = keyOf(node, HeadingTag);
      const text = flatten(props.children);
      const sizeKey = HeadingTag as keyof typeof sizes;

      return React.createElement(
        HeadingTag,
        {
          key: bk,
          className: cn(className, forcedTextSize || sizes[sizeKey], textColor),
          ...props,
        },
        createBlockStreamer(text)
      );
    };
  };

  const isNestedListEl = (el: unknown): boolean =>
    React.isValidElement(el) &&
    (el.type === "ul" ||
      el.type === "ol" ||
      el.type === UlBlock ||
      el.type === OlBlock);

  const elementContainsList = (el: unknown): boolean => {
    if (!React.isValidElement(el)) return false;
    if (isNestedListEl(el)) return true;
    const props = getElementProps(el);
    const ch = props.children;
    if (Array.isArray(ch)) return ch.some((c) => elementContainsList(c));
    if (React.isValidElement(ch)) return elementContainsList(ch);
    return false;
  };

  const isListElement = (el: unknown) =>
    React.isValidElement(el) &&
    (el.type === "ul" ||
      el.type === "ol" ||
      el.type === UlBlock ||
      el.type === OlBlock);

  // Animation style for wrapped elements.
  const animationStyle: React.CSSProperties = {
    animationName,
    animationDuration,
    animationTimingFunction,
    animationIterationCount: 1,
    whiteSpace: "pre-wrap",
    display: "inline",
  };

  const animateText = (input: React.ReactNode): React.ReactNode => {
    if (typeof input === "string") {
      return createBlockStreamer(input);
    }
    if (Array.isArray(input)) {
      return input.map((el, i) => (
        <React.Fragment key={`f-${i}`}>{animateText(el)}</React.Fragment>
      ));
    }
    if (React.isValidElement(input)) {
      return isStreaming ? <span style={animationStyle}>{input}</span> : input;
    }
    return input;
  };

  return {
    // Let parent blocks handle animation to keep identity stable
    text: ({ node, ...props }: ComponentProps) => props.children,

    h1: createHeadingComponent(1, "s-pb-2 s-pt-4"),

    h2: createHeadingComponent(2, "s-pb-2 s-pt-4"),

    h3: createHeadingComponent(3, "s-pb-2 s-pt-4"),

    h4: createHeadingComponent(4, "s-pb-2 s-pt-3"),

    h5: createHeadingComponent(5, "s-pb-1.5 s-pt-2.5"),

    h6: createHeadingComponent(6, "s-pb-1.5 s-pt-2.5"),

    p: ({ node, ...props }: ComponentProps) => {
      const bk = keyOf(node, "p");

      // Process children to handle mixed content (text, bold, italic, etc.).
      const processChildren = (children: React.ReactNode): React.ReactNode => {
        if (!children) return null;

        // If it's just a string, stream it.
        if (typeof children === "string") {
          return createBlockStreamer(children);
        }

        // If it's an array, process each child.
        if (Array.isArray(children)) {
          return children.map((child, idx) => {
            if (typeof child === "string") {
              return createBlockStreamer(child, idx);
            }

            // React elements (strong, em, code, etc.) - recursively process their children.
            if (isReactElementWithProps(child)) {
              const childProps = getElementProps(child);
              return React.cloneElement(
                child,
                { ...childProps, key: idx },
                processChildren(childProps.children)
              );
            }

            return child;
          });
        }

        if (isReactElementWithProps(children)) {
          const childProps = getElementProps(children);
          return React.cloneElement(
            children,
            childProps,
            processChildren(childProps.children)
          );
        }

        return children;
      };

      return (
        <ParagraphBlock
          key={bk}
          textColor={textColor}
          textSize={forcedTextSize || sizes.p}
        >
          {processChildren(props.children)}
        </ParagraphBlock>
      );
    },

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

    li: ({
      node,
      ordered,
      index,
      checked,
      ...props
    }: ComponentProps & {
      ordered?: boolean;
      index?: number;
      checked?: boolean | null;
    }) => {
      const bk = keyOf(node, "li");

      // Process list item children to handle text streaming and nested lists.
      const processChildren = (children: React.ReactNode): React.ReactNode => {
        if (!children) return null;

        // If it's just a string, animate it.
        if (typeof children === "string") {
          return createBlockStreamer(children);
        }

        // Safety check: if it's a non-React object, don't try to process it.
        if (
          typeof children === "object" &&
          children !== null &&
          !React.isValidElement(children) &&
          !Array.isArray(children)
        ) {
          console.warn("Unexpected object in processChildren:", children);
          return null;
        }

        // If it's an array, process each child
        if (Array.isArray(children)) {
          // Filter out empty strings and newlines that might cause spacing.
          const filtered = children.filter(
            (child) => !(typeof child === "string" && child.trim() === "")
          );

          return filtered.map((child, idx) => {
            if (typeof child === "string") {
              return createBlockStreamer(child, idx);
            }

            // Nested lists are preserved as-is (they'll handle their own animation).
            if (React.isValidElement(child) && isListElement(child)) {
              return child;
            }

            // Table elements are preserved as-is.
            if (
              React.isValidElement(child) &&
              (child.type === "table" ||
                child.type === TableBlock ||
                child.type === "thead" ||
                child.type === TableHeadBlock ||
                child.type === "tbody" ||
                child.type === TableBodyBlock ||
                child.type === "th" ||
                child.type === TableHeaderBlock ||
                child.type === "td" ||
                child.type === TableDataBlock ||
                child.type === "tr")
            ) {
              return child;
            }

            // For paragraph elements inside list items, extract and animate their content.
            if (isReactElementWithProps(child) && child.type === "p") {
              const props = getElementProps(child);
              return processChildren(props.children);
            }

            // Code blocks (pre elements) should be returned as-is.
            if (
              React.isValidElement(child) &&
              (child.type === "pre" || child.type === PreBlock)
            ) {
              return child;
            }

            // Code elements (inline code or code blocks) should be returned as-is.
            if (
              React.isValidElement(child) &&
              (child.type === "code" ||
                child.type === CodeBlockWithExtendedSupport)
            ) {
              return child;
            }

            // Other elements: recursively process their children.
            if (isReactElementWithProps(child)) {
              const childProps = getElementProps(child);

              // Don't process children for certain element types that handle their own content
              const elementType = child.type;
              if (
                elementType === "code" ||
                elementType === "pre" ||
                elementType === PreBlock ||
                elementType === CodeBlockWithExtendedSupport ||
                elementType === "table" ||
                elementType === TableBlock ||
                elementType === "thead" ||
                elementType === TableHeadBlock ||
                elementType === "tbody" ||
                elementType === TableBodyBlock ||
                elementType === "th" ||
                elementType === TableHeaderBlock ||
                elementType === "td" ||
                elementType === TableDataBlock ||
                elementType === "tr"
              ) {
                return child;
              }

              // Skip processing if children is already a string (don't double-process)
              if (typeof childProps.children === "string") {
                return child;
              }

              // Clone the element with processed children
              return React.cloneElement(
                child,
                { ...childProps, key: idx },
                processChildren(childProps.children)
              );
            }

            // If it's an object but not a React element, return empty string to avoid [object Object]
            if (typeof child === "object" && child !== null) {
              return null;
            }

            return child;
          });
        }

        // Single React element
        if (React.isValidElement(children)) {
          if (isListElement(children)) {
            return children;
          }
          // For paragraph elements, extract their content
          if (children.type === "p") {
            const props = getElementProps(children);
            return processChildren(props.children);
          }
          // Code blocks (pre elements) should be returned as-is
          if (children.type === "pre" || children.type === PreBlock) {
            return children;
          }
          // Code elements (inline code or code blocks) should be returned as-is
          if (
            children.type === "code" ||
            children.type === CodeBlockWithExtendedSupport
          ) {
            return children;
          }
          // Table elements should be returned as-is
          if (
            children.type === "table" ||
            children.type === TableBlock ||
            children.type === "thead" ||
            children.type === TableHeadBlock ||
            children.type === "tbody" ||
            children.type === TableBodyBlock ||
            children.type === "th" ||
            children.type === TableHeaderBlock ||
            children.type === "td" ||
            children.type === TableDataBlock ||
            children.type === "tr"
          ) {
            return children;
          }
          const childProps = getElementProps(children);
          return React.cloneElement(
            children,
            childProps,
            processChildren(childProps.children)
          );
        }

        return children;
      };

      return (
        <LiBlock
          key={bk}
          textColor={textColor}
          textSize={forcedTextSize || sizes.p}
          className="s-stream-marker"
        >
          {processChildren(props.children)}
        </LiBlock>
      );
    },

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
      return <TableDataBlock>{createBlockStreamer(text)}</TableDataBlock>;
    },
    input: Input,
    ...additionalMarkdownComponents,
  };
}
