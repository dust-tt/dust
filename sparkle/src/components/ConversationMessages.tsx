import { cva } from "class-variance-authority";
import React from "react";

import { Avatar, CitationGrid } from "@sparkle/components";
import { cn } from "@sparkle/lib/utils";

type ConversationMessageType = "user" | "agent";
type MessageType = "me" | "user" | "agent";

const wrapperVariants = cva("s-flex s-flex-col s-@container @sm:s-flex-row", {
  variants: {
    messageType: {
      agent: "s-pr-0",
      me: "s-pl-9",
      user: "s-pr-9",
    },
  },
  defaultVariants: {
    messageType: "agent",
  },
});
const messageVariants = cva("s-flex s-rounded-2xl s-max-w-full", {
  variants: {
    type: {
      user: "s-bg-muted-background dark:s-bg-muted-background-night s-px-3 s-py-3 s-gap-2 s-w-fit",
      agent: "s-w-full s-gap-3 s-p-4 @sm:s-flex-row s-flex-col",
    },
  },
  defaultVariants: {
    type: "agent",
  },
});

interface ConversationMessageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  messageType: MessageType;
  type: ConversationMessageType;
}

export const ConversationMessageContainer = React.forwardRef<
  HTMLDivElement,
  ConversationMessageContainerProps
>(({ children, className, messageType, type, ...props }, ref) => {
  return (
    <div ref={ref} className={cn(wrapperVariants({ messageType }))}>
      <div className={cn(messageVariants({ type, className }))} {...props}>
        {children}
      </div>
    </div>
  );
});

ConversationMessageContainer.displayName = "ConversationMessageContainer";

interface ConversationMessageContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  citations?: React.ReactElement[];
  type: ConversationMessageType;
  infoChip?: React.ReactNode;
}

export const ConversationMessageContent = React.forwardRef<
  HTMLDivElement,
  ConversationMessageContentProps
>(({ children, citations, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("s-flex s-min-w-0 s-flex-col s-gap-1", className)}
      {...props}
    >
      <div className="s-text-base s-text-foreground dark:s-text-foreground-night">
        {children}
      </div>
      {citations && citations.length > 0 && (
        <CitationGrid>{citations}</CitationGrid>
      )}
    </div>
  );
});

ConversationMessageContent.displayName = "ConversationMessageContent";

interface ConversationMessageAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  avatarUrl?: string | React.ReactNode;
  isBusy?: boolean;
  isDisabled?: boolean;
  name?: string;
  type: ConversationMessageType;
}

export const ConversationMessageAvatar = React.forwardRef<
  HTMLDivElement,
  ConversationMessageAvatarProps
>(
  (
    { avatarUrl, isBusy, isDisabled, name = "", className, type, ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn("conversation:s-p-0 s-flex s-gap-2", className)}
        {...props}
      >
        <Avatar
          className="@sm:s-hidden"
          name={name}
          visual={avatarUrl}
          busy={isBusy}
          disabled={isDisabled}
          isRounded={type === "user"}
          size="xs"
        />
        <Avatar
          className="s-hidden @sm:s-flex"
          name={name}
          visual={avatarUrl}
          busy={isBusy}
          disabled={isDisabled}
          isRounded={type === "user"}
          size="sm"
        />
      </div>
    );
  }
);

ConversationMessageAvatar.displayName = "ConversationMessageAvatar";

interface ConversationMessageTitleProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  timestamp?: string;
  infoChip?: React.ReactNode;
  completionStatus?: React.ReactNode;
  renderName: (name: string | null) => React.ReactNode;
}

export const ConversationMessageTitle = React.forwardRef<
  HTMLDivElement,
  ConversationMessageTitleProps
>(
  (
    {
      name = "",
      timestamp,
      infoChip,
      completionStatus,
      renderName,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "s-inline-flex s-flex-1 s-items-center s-justify-between s-gap-0.5",
          className
        )}
        {...props}
      >
        <div className="s-inline-flex s-items-center s-gap-2 s-text-foreground dark:s-text-foreground-night">
          <span className="s-heading-sm">{renderName(name)}</span>
          <span className="s-heading-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
            {timestamp}
          </span>
          {infoChip && (
            <div className="s-inline-flex s-items-center">{infoChip}</div>
          )}
        </div>
        <div className="s-ml-1 s-inline-flex s-items-center">
          {completionStatus ?? null}
        </div>
      </div>
    );
  }
);

ConversationMessageTitle.displayName = "ConversationMessageTitle";
