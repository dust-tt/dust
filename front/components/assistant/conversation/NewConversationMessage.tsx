import { Avatar, CitationGrid, cn } from "@dust-tt/sparkle";
import { cva } from "class-variance-authority";
import React from "react";

type ConversationMessageType = "user" | "agent";
type MessageType = "me" | "user" | "agent";

const wrapperVariants = cva("flex flex-col @container", {
  variants: {
    messageType: {
      agent: "pr-0",
      me: "pl-9",
      user: "pr-9",
    },
  },
  defaultVariants: {
    messageType: "agent",
  },
});
const messageVariants = cva("flex rounded-2xl max-w-full", {
  variants: {
    type: {
      user: "bg-muted-background dark:bg-muted-background-night px-3 py-3 gap-2",
      agent: "w-full gap-3 p-4",
    },
  },
  defaultVariants: {
    type: "agent",
  },
});

interface NewConversationMessageContainerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  messageType: MessageType;
  type: ConversationMessageType;
}

export const NewConversationMessageContainer = React.forwardRef<
  HTMLDivElement,
  NewConversationMessageContainerProps
>(({ children, className, messageType, type, ...props }, ref) => {
  return (
    <div ref={ref} className={cn(wrapperVariants({ messageType }))}>
      <div
        className={cn(messageVariants({ type, className }), "flex-row")}
        {...props}
      >
        {children}
      </div>
    </div>
  );
});

interface ConversationMessageContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
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
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    >
      <div className="text-base text-foreground dark:text-foreground-night">
        {children}
      </div>
      {citations && citations.length > 0 && (
        <CitationGrid>{citations}</CitationGrid>
      )}
    </div>
  );
});

ConversationMessageContent.displayName = "ConversationMessageContent";

interface ConversationMessageAvatarProps
  extends React.HTMLAttributes<HTMLDivElement> {
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
        className={cn("conversation:p-0 flex gap-2", className)}
        {...props}
      >
        <Avatar
          className="@sm:hidden"
          name={name}
          visual={avatarUrl}
          busy={isBusy}
          disabled={isDisabled}
          isRounded={type === "user"}
          size="xs"
        />
        <Avatar
          className="hidden @sm:flex"
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

interface ConversationMessageTitleProps
  extends React.HTMLAttributes<HTMLDivElement> {
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
          "inline-flex flex-1 items-center justify-between gap-0.5",
          className
        )}
        {...props}
      >
        <div className="inline-flex items-center gap-2 text-foreground dark:text-foreground-night">
          <span className="heading-sm">{renderName(name)}</span>
          <span className="heading-xs text-muted-foreground dark:text-muted-foreground-night">
            {timestamp}
          </span>
          {infoChip && (
            <div className="inline-flex items-center">{infoChip}</div>
          )}
        </div>
        <div className="ml-1 inline-flex items-center">
          {completionStatus ?? null}
        </div>
      </div>
    );
  }
);

ConversationMessageTitle.displayName = "ConversationMessageTitle";
