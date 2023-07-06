import {
  HandThumbDownIcon,
  HandThumbUpIcon,
} from "@heroicons/react/24/outline";
import {
  HandThumbDownIcon as HTDIFull,
  HandThumbUpIcon as HTUIFull,
} from "@heroicons/react/24/solid";

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
            ? "text-violet-800"
            : "hover:text-violet-800",
          !message.feedback && hover ? "invisible group-hover:visible" : ""
        )}
      >
        {message.feedback === "positive" ? (
          <HTUIFull className="h-4 w-4"></HTUIFull>
        ) : (
          <HandThumbUpIcon className="h-4 w-4"></HandThumbUpIcon>
        )}
      </div>
      <div
        onClick={() => feedbackHandler(message, "negative")}
        className={classNames(
          "ml-2 cursor-pointer rounded-md p-px",
          message.feedback === "negative"
            ? "text-violet-800"
            : "hover:text-violet-800",
          !message.feedback && hover ? "invisible group-hover:visible" : ""
        )}
      >
        {message.feedback === "negative" ? (
          <HTDIFull className="h-4 w-4"></HTDIFull>
        ) : (
          <HandThumbDownIcon className="h-4 w-4"></HandThumbDownIcon>
        )}
      </div>
    </div>
  );
}
