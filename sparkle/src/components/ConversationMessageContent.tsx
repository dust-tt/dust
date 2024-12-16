import React from "react";

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
      {citations && (
        <div
          className={cn(
            "s-grid s-grid-cols-2 s-gap-2",
            size === "compact"
              ? ""
              : "@xs:s-grid-cols-2 @sm:s-grid-cols-3 @lg:s-grid-cols-4 @xl:s-grid-cols-5"
          )}
        >
          {citations}
        </div>
      )}
    </div>
  );
}
