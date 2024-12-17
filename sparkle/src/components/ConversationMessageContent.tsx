import React from "react";

import { CitationGrid } from "@sparkle/components/";
import { ConversationMessageSizeType } from "@sparkle/components/ConversationMessage";
import { cn } from "@sparkle/lib/utils";

interface ConversationMessageContentProps {
  children: React.ReactNode;
  citations?: React.ReactElement[];
  size: ConversationMessageSizeType;
}

export function ConversationMessageContent({
  children,
  citations,
  size,
}: ConversationMessageContentProps) {
  return (
    <div
      className={cn(
        "s-flex s-flex-col s-justify-stretch s-@container",
        size === "compact" ? "s-gap-3" : "s-gap-4"
      )}
    >
      <div
        className={cn(
          "s-px-3 s-font-normal s-text-element-900",
          size === "compact" ? "s-text-sm" : "s-text-base"
        )}
      >
        {children}
      </div>
      {citations && <CitationGrid>{citations}</CitationGrid>}
    </div>
  );
}
