import React from "react";

import { ContentBlockWrapper } from "@sparkle/components";
import { cn } from "@sparkle/lib/utils";

type BlockquoteBlockProps = { children: React.ReactNode };

export function BlockquoteBlock({ children }: BlockquoteBlockProps) {
  const elementAt1 = React.Children.toArray(children)[1];
  const childrenContent =
    elementAt1 && React.isValidElement(elementAt1)
      ? elementAt1.props.children
      : null;

  // Convert array content to string if necessary
  const contentAsString = Array.isArray(childrenContent)
    ? childrenContent.join("")
    : childrenContent;

  // Only pass content if it exists
  const clipboardContent = contentAsString
    ? { "text/plain": contentAsString }
    : undefined;

  return (
    <ContentBlockWrapper content={clipboardContent} className="s-my-2">
      <blockquote
        className={cn(
          "s-w-full s-text-base s-italic",
          "s-rounded-2xl s-py-3 s-pl-5 s-pr-12",
          "dark:s-text-foreground-night s-text-foreground",
          "dark:s-bg-muted-background-night s-bg-muted-background"
        )}
      >
        {children}
      </blockquote>
    </ContentBlockWrapper>
  );
}
