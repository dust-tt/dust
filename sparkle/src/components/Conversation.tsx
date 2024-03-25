import React, { cloneElement, ReactElement } from "react";

import {
  ArrowPathIcon,
  Avatar,
  Button,
  ClipboardIcon,
  IconButton,
  MoreIcon,
  PencilSquareIcon,
  ReactionIcon,
} from "@sparkle/_index";
import { classNames } from "@sparkle/lib/utils";

type SizeType = "normal" | "compact";
type MessageType = "user" | "agent" | "fragment";

interface ConversationProps {
  children: React.ReactNode;
  size?: SizeType;
}

export function Conversation({ children, size = "normal" }: ConversationProps) {
  return (
    <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-2">
      {React.Children.map(children, (child) => {
        if (React.isValidElement<MessageProps>(child)) {
          const clonedChild: ReactElement<MessageProps> = cloneElement(child, {
            size,
          });
          return clonedChild;
        }
        return child;
      })}
    </div>
  );
}

interface MessageProps {
  header: MessageHeaderProps;
  message: MessageContentProps;
  actions?: React.ReactNode;
  size?: SizeType;
  type: MessageType;
}

const messageSizeClasses = {
  compact: "s-p-3",
  normal: "s-p-4",
};

const messageTypeClasses = {
  user: "s-bg-structure-50",
  agent: "",
  fragment: "",
};

Conversation.Message = function ({
  header,
  message,
  type,
  size = "normal",
}: MessageProps) {
  return (
    <div
      className={classNames(
        "s-flex s-w-full s-flex-col s-justify-stretch s-gap-4 s-rounded-2xl",
        messageTypeClasses[type],
        messageSizeClasses[size]
      )}
    >
      <Conversation.MessageHeader {...header} size={size} />
      <Conversation.MessageContent {...message} size={size} />
      <MessageActions type={type} />
    </div>
  );
};

interface MessageHeaderProps {
  name: string;
  avatarUrl?: string;
  onClick?: () => void;
  size?: SizeType;
  isBusy?: boolean;
}

Conversation.MessageHeader = function ({
  name,
  avatarUrl,
  onClick,
  isBusy = false,
  size = "normal",
}: MessageHeaderProps) {
  return (
    <div className="s-flex s-items-center s-gap-2">
      <Avatar
        size={size === "compact" ? "xs" : "md"}
        name={name}
        visual={avatarUrl}
        busy={isBusy}
      />
      <div className="s-flex s-items-center s-gap-2">
        <div
          className={classNames(
            "s-pb-1 s-text-base s-font-medium s-text-element-900",
            size === "compact" ? "s-text-sm" : "s-text-base"
          )}
        >
          {name}
        </div>
        {onClick && (
          <IconButton
            variant="tertiary"
            icon={MoreIcon}
            onClick={onClick}
            size={size === "compact" ? "xs" : "sm"}
          />
        )}
      </div>
    </div>
  );
};

interface MessageContentProps {
  action?: React.ReactNode;
  message?: React.ReactNode;
  citations?: React.ReactNode;
  size?: SizeType;
}

Conversation.MessageContent = function ({
  action,
  message,
  citations,
  size = "normal",
}: MessageContentProps) {
  return (
    <div
      className={classNames(
        "s-flex s-flex-col s-justify-stretch",
        size === "compact" ? "s-gap-3" : "s-gap-4"
      )}
    >
      {action && <div>{action}</div>}
      <div
        className={classNames(
          "s-px-3 s-font-normal s-text-element-900",
          size === "compact" ? "s-text-sm" : "s-text-base"
        )}
      >
        {message}
      </div>
      {citations && (
        <div
          className={classNames(
            "s-grid s-gap-2",
            size === "compact" ? "s-grid-cols-2" : "s-grid-cols-4"
          )}
        >
          {citations}
        </div>
      )}
    </div>
  );
};

interface MessageActionsProps {
  type?: MessageType;
}

function MessageActions({ type }: MessageActionsProps) {
  const getActions = () => {
    switch (type) {
      case "agent":
        return (
          <>
            <Button
              size="xs"
              variant="tertiary"
              label="Retry"
              labelVisible={false}
              icon={ArrowPathIcon}
            />
            <Button
              size="xs"
              variant="tertiary"
              label="Copy"
              labelVisible={false}
              icon={ClipboardIcon}
            />
            <Button
              size="xs"
              variant="tertiary"
              labelVisible={false}
              label="Emoji"
              icon={ReactionIcon}
              type="menu"
            />
          </>
        );
      case "user":
        return (
          <Button
            size="xs"
            variant="tertiary"
            label="Edit"
            labelVisible={false}
            icon={PencilSquareIcon}
          />
        );
      default:
        return null; // or any default component you want to render
    }
  };

  return <div className="s-flex s-justify-end s-gap-2">{getActions()}</div>;
}
