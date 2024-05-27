import { Avatar } from "@dust-tt/sparkle";

import type { MessageSizeType } from "@app/components/assistant/conversation/ConversationMessage";
import { classNames } from "@app/lib/utils";

interface MessageHeaderProps {
  avatarUrl?: string | React.ReactNode;
  isBusy?: boolean;
  name?: string;
  renderName: (name: string | null) => React.ReactNode;
  size: MessageSizeType;
}

export function MessageHeader({
  avatarUrl,
  isBusy,
  name = "",
  renderName,
  size,
}: MessageHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <Avatar
        size={size === "compact" ? "xs" : "md"}
        name={name}
        visual={avatarUrl}
        busy={isBusy}
      />
      <div className="flex items-center gap-2">
        <div
          className={classNames(
            "pb-1 text-base font-medium text-element-900",
            size === "compact" ? "text-sm" : "text-base"
          )}
        >
          {renderName(name)}
        </div>
      </div>
    </div>
  );
}
