import { HandThumbDownSolidIcon, HandThumbUpSolidIcon } from "@dust-tt/sparkle";

import { classNames } from "@app/lib/utils";
import { ChatMessageType, MessageFeedbackStatus } from "@app/types/chat";

export type FeedbackHandler = (
  message: ChatMessageType,
  status: MessageFeedbackStatus
) => void;

export function MessageFeedback({
  message,
  feedbackHandler,
  hover, // should the feedback be always visible or only on hover?
}: {
  message: ChatMessageType;
  feedbackHandler: FeedbackHandler;
  hover: boolean;
}) {
  return (
    <div
      className={classNames("flex-end flex h-2 flex-row-reverse text-gray-400")}
    >
      <div
        onClick={() => feedbackHandler(message, "positive")}
        className={classNames(
          "ml-2 cursor-pointer rounded-md p-px",
          message.feedback === "positive"
            ? "text-action-500"
            : "hover:text-action-600",
          !message.feedback && hover ? "invisible group-hover:visible" : ""
        )}
      >
        {message.feedback === "positive" ? (
          <HandThumbUpSolidIcon className="h-4 w-4" />
        ) : (
          <HandThumbUpSolidIcon className="h-4 w-4" />
        )}
      </div>
      <div
        onClick={() => feedbackHandler(message, "negative")}
        className={classNames(
          "ml-2 cursor-pointer rounded-md p-px",
          message.feedback === "negative"
            ? "text-action-500"
            : "hover:text-action-600",
          !message.feedback && hover ? "invisible group-hover:visible" : ""
        )}
      >
        {message.feedback === "negative" ? (
          <HandThumbDownSolidIcon className="h-4 w-4" />
        ) : (
          <HandThumbDownSolidIcon className="h-4 w-4" />
        )}
      </div>
    </div>
  );
}
