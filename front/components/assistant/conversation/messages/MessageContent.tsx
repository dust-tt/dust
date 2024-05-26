import type { ContentFragmentType } from "@dust-tt/types";

import { ContentFragment } from "@app/components/assistant/conversation/ContentFragment";
import type { SizeType } from "@app/components/assistant/conversation/messages/MessageHeader";
import { classNames } from "@app/lib/utils";

interface MessageContentProps {
  children: React.ReactNode;
  citations?: ContentFragmentType[];
  size?: SizeType;
}

export function MessageContent({
  children,
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
      <div
        className={classNames(
          "px-3 font-normal text-element-900",
          size === "compact" ? "text-sm" : "text-base"
        )}
      >
        {children}
      </div>
      {citations && (
        <div
          className={classNames(
            "grid gap-2",
            size === "compact" ? "grid-cols-2" : "grid-cols-4"
          )}
        >
          {citations.map((c) => {
            // TODO: key.
            return <ContentFragment message={c} key={c.id} />;
          })}
        </div>
      )}
    </div>
  );
}
