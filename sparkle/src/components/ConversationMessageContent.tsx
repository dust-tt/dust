import React from "react";

import {
  ConversationCitationComponent,
  ConversationCitationType,
} from "@sparkle/components/ConversationCitationComponent";
import { ConversationMessageSizeType } from "@sparkle/components/ConversationMessage";
import { cn } from "@sparkle/lib/utils";

interface ConversationMessageContentProps {
  children: React.ReactNode;
  citations?: ConversationCitationType[];
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
        "s-flex s-flex-col s-justify-stretch",
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
            "s-grid s-gap-2",
            size === "compact" ? "s-grid-cols-2" : "s-grid-cols-4"
          )}
        >
          {citations.map((c) => {
            return <ConversationCitationComponent citation={c} key={c.id} />;
          })}
        </div>
      )}
    </div>
  );
}
