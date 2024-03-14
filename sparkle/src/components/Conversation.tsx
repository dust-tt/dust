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

interface ConversationProps {
  children: React.ReactNode;
  size?: "normal" | "compact";
}

export function Conversation({ children, size = "normal" }: ConversationProps) {
  return (
    <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-2">
      {React.Children.map(children, (child) => {
        // Ensure child is a valid React element before proceeding
        if (React.isValidElement(child)) {
          // Check if the child has a specific property or type indicating it's a Conversation.Message
          // Here we assume a prop 'isMessageComponent' for identification. Adjust as necessary.
          if (typeof child.type !== "string" && child.props.type) {
            // Clone the element with the new variant prop
            return cloneElement(child as ReactElement<any>, { size });
          }
        }
        return child;
      })}
    </div>
  );
}

interface MessageProps {
  message: React.ReactNode;
  header: React.ReactNode;
  actions?: React.ReactNode;
  size?: "compact" | "normal";
  type: "user" | "agent" | "fragment";
}

const sizeClasses = {
  compact: "s-p-3",
  normal: "s-p-4",
};

const typeClasses = {
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
        typeClasses[type],
        sizeClasses[size]
      )}
    >
      {header}
      {message}
      <MessageActions type={type} />
    </div>
  );
};

interface MessageHeaderProps {
  name: string;
  avatarUrl?: string;
  onClick?: () => void;
  isBusy?: boolean;
}

Conversation.MessageHeader = function ({
  name,
  avatarUrl,
  onClick,
  isBusy = false,
}: MessageHeaderProps) {
  return (
    <div className="s-flex s-items-center s-gap-2">
      <Avatar size="md" name={name} visual={avatarUrl} busy={isBusy} />
      <div className="s-flex s-items-center s-gap-2">
        <div className="s-pb-1 s-text-base s-font-medium s-text-element-900">
          {name}
        </div>
        {onClick && (
          <IconButton variant="tertiary" icon={MoreIcon} onClick={onClick} />
        )}
      </div>
    </div>
  );
};

interface MessageContentProps {
  action?: React.ReactNode;
  message?: React.ReactNode;
  citations?: React.ReactNode;
}

Conversation.MessageContent = function ({
  action,
  message,
  citations,
}: MessageContentProps) {
  return (
    <div className="s-flex s-flex-col s-justify-stretch s-gap-4">
      {action && <div>{action}</div>}
      <div className="s-px-3">{message}</div>
      {citations && (
        <div className="s-grid s-grid-cols-2 s-gap-2 md:s-grid-cols-3 lg:s-grid-cols-4">
          {citations}
        </div>
      )}
    </div>
  );
};

interface MessageActionsProps {
  type?: "agent" | "user" | "fragment";
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
