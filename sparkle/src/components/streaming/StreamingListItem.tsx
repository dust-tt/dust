import React from "react";

import { LiBlock } from "@sparkle/components/markdown/List";
import { BlockStreamer } from "@sparkle/components/streaming/BlockStreamer";
import type { ComponentProps } from "@sparkle/components/streaming/types";
import {
  getElementProps,
  isCodeElement,
  isListElement,
  isReactElementWithProps,
  isTableElement,
  keyOf,
} from "@sparkle/components/streaming/utils";

interface StreamingListItemProps extends ComponentProps {
  isStreaming: boolean;
  animationName: string;
  animationDuration: string;
  animationTimingFunction: string;
  textColor?: string;
  forcedTextSize?: string;
  sizes: Record<string, string>;
}

export function StreamingListItem({
  node,
  isStreaming,
  animationName,
  animationDuration,
  animationTimingFunction,
  textColor,
  forcedTextSize,
  sizes,
  ...props
}: StreamingListItemProps) {
  const bk = keyOf(node, "li");

  // Process list item children to handle text streaming and nested lists.
  const processChildren = (children: React.ReactNode): React.ReactNode => {
    if (!children) {
      return null;
    }

    // If it's just a string, animate it.
    if (typeof children === "string") {
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

        // Nested lists are preserved as-is (they'll handle their own animation).
        if (React.isValidElement(child) && isListElement(child)) {
          return child;
        }

        // Table elements are preserved as-is.
        if (isTableElement(child)) {
          return child;
        }

        // For paragraph elements inside list items, extract and animate their content.
        if (isReactElementWithProps(child) && child.type === "p") {
          const props = getElementProps(child);
          return processChildren(props.children);
        }

        // Code elements (including pre blocks) should be returned as-is.
        if (isCodeElement(child)) {
          return child;
        }

        // Other elements: recursively process their children.
        if (isReactElementWithProps(child)) {
          const childProps = getElementProps(child);

          // Don't process children for certain element types that handle their own content
          if (isCodeElement(child) || isTableElement(child)) {
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
      // Code and table elements should be returned as-is
      if (isCodeElement(children) || isTableElement(children)) {
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
      textColor={textColor || ""}
      textSize={forcedTextSize || sizes.p}
      className="s-stream-marker"
    >
      {processChildren(props.children)}
    </LiBlock>
  );
}
