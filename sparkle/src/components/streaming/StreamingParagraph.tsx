import { ParagraphBlock } from "@sparkle/components/markdown/ParagraphBlock";
import { BlockStreamer } from "@sparkle/components/streaming/BlockStreamer";
import type { ComponentProps } from "@sparkle/components/streaming/types";
import {
  getElementProps,
  isReactElementWithProps,
  keyOf,
} from "@sparkle/components/streaming/utils";
import React from "react";

interface StreamingParagraphProps extends ComponentProps {
  isStreaming: boolean;
  animationName: string;
  animationDuration: string;
  animationTimingFunction: string;
  textColor?: string;
  forcedTextSize?: string;
  sizes: Record<string, string>;
}

export function StreamingParagraph({
  node,
  isStreaming,
  animationName,
  animationDuration,
  animationTimingFunction,
  textColor,
  forcedTextSize,
  sizes,
  ...props
}: StreamingParagraphProps) {
  const bk = keyOf(node, "p");

  // Process children to handle mixed content (text, bold, italic, etc.).
  const processChildren = (children: React.ReactNode): React.ReactNode => {
    if (!children) return null;

    // If it's just a string, stream it.
    if (typeof children === "string") {
      //   return createBlockStreamer(children);
      return (
        <BlockStreamer
          text={children}
          animate={isStreaming}
          animationName={animationName}
          animationDuration={animationDuration}
          animationTimingFunction={animationTimingFunction}
        />
      );
    }

    // If it's an array, process each child.
    if (Array.isArray(children)) {
      return children.map((child, idx) => {
        if (typeof child === "string") {
          return (
            <BlockStreamer
              key={idx}
              text={child}
              animate={isStreaming}
              animationName={animationName}
              animationDuration={animationDuration}
              animationTimingFunction={animationTimingFunction}
            />
          );
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
      textColor={textColor || ""}
      textSize={forcedTextSize || sizes.p}
    >
      {processChildren(props.children)}
    </ParagraphBlock>
  );
}
