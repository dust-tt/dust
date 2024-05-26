import { Avatar } from "@dust-tt/sparkle";

import { classNames } from "@app/lib/utils";

export type SizeType = "normal" | "compact";

interface MessageHeaderProps {
  avatarUrl?: string | React.ReactNode;
  isBusy?: boolean;
  name?: string;
  renderName: (name: string | null) => React.ReactNode;
  size: SizeType;
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
      {/* // TODO: Handle avatar size based on media queries. */}
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
