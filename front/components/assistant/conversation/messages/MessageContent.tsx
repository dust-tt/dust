import type { SizeType } from "@app/components/assistant/conversation/messages/MessageHeader";
import { classNames } from "@app/lib/utils";

interface MessageContentProps {
  action?: React.ReactNode;
  message?: React.ReactNode;
  citations?: React.ReactNode;
  size?: SizeType;
}

export function MessageContent({
  action,
  message,
  citations,
  size = "normal",
}: MessageContentProps) {
  return (
    <div
      className={classNames(
        "flex flex-col justify-stretch",
        size === "compact" ? "gap-3" : "gap-4"
      )}
    >
      {action && <div>{action}</div>}
      <div
        className={classNames(
          "px-3 font-normal text-element-900",
          size === "compact" ? "text-sm" : "text-base"
        )}
      >
        {message}
      </div>
      {citations && (
        <div
          className={classNames(
            "grid gap-2",
            size === "compact" ? "grid-cols-2" : "grid-cols-4"
          )}
        >
          {citations}
        </div>
      )}
    </div>
  );
}
