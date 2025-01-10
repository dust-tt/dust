import React from "react";

import { Avatar } from "@sparkle/components/Avatar";
import { ConversationMessageSizeType } from "@sparkle/components/ConversationMessage";
import { cn } from "@sparkle/lib/utils";

interface ConversationMessageHeaderProps {
  avatarUrl?: string | React.ReactNode;
  isBusy?: boolean;
  name?: string;
  renderName: (name: string | null) => React.ReactNode;
  size: ConversationMessageSizeType;
}

export function ConversationMessageHeader({
  avatarUrl,
  isBusy,
  name = "",
  renderName,
  size,
}: ConversationMessageHeaderProps) {
  return (
    <div className="s-flex s-items-center s-gap-2">
      <Avatar
        size={size === "compact" ? "xs" : "md"}
        name={name}
        visual={avatarUrl}
        busy={isBusy}
      />
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "s-pb-1 s-text-base s-font-medium s-text-foreground",
            size === "compact" ? "s-text-sm" : "s-text-base"
          )}
        >
          {renderName(name)}
        </div>
      </div>
    </div>
  );
}
