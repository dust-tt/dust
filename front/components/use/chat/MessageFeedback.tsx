import {
  HandThumbDownSolidIcon,
  HandThumbUpSolidIcon,
  IconButton,
  IconToggleButton,
} from "@dust-tt/sparkle";

import { classNames } from "@app/lib/utils";
import { ChatMessageType, MessageFeedbackStatus } from "@app/types/chat";
import { useState } from "react";

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
  const [feedback, setFeedback] = useState<MessageFeedbackStatus>(
    message.feedback || null
  );
  return (
    <div
      className={classNames(
        "flex-end flex h-2 flex-row-reverse text-gray-400",
        !message.feedback && hover ? "invisible group-hover:visible" : ""
      )}
    >
      <IconButton
        type={message.feedback === "positive" ? "primary" : "secondary"}
        icon={HandThumbUpSolidIcon}
        onClick={() => feedbackHandler(message, "positive")}
        className="ml-1"
      />
      <IconButton
        type={message.feedback === "negative" ? "primary" : "secondary"}
        icon={HandThumbDownSolidIcon}
        onClick={() => feedbackHandler(message, "negative")}
        className="ml-1"
      />
    </div>
  );
}
