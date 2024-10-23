import type { ConversationCitationType } from "@app/components/assistant/conversation/messages/ConverationCitationComponent";
import { ConverationCitationComponent } from "@app/components/assistant/conversation/messages/ConverationCitationComponent";
import type { MessageSizeType } from "@app/components/assistant/conversation/messages/ConversationMessage";
import { classNames } from "@app/lib/utils";

interface MessageContentProps {
  children: React.ReactNode;
  citations?: ConversationCitationType[];
  size: MessageSizeType;
}

export function MessageContent({
  children,
  citations,
  size,
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
            return <ConverationCitationComponent citation={c} key={c.id} />;
          })}
        </div>
      )}
    </div>
  );
}
