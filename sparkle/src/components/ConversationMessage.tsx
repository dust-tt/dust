import { cva, VariantProps } from "class-variance-authority";
import React from "react";

import { Avatar, Button, CitationGrid } from "@sparkle/components";
import { cn } from "@sparkle/lib/utils";

export const ConversationContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-flex s-h-full s-w-full s-flex-col s-items-center",
        className
      )}
      {...props}
    >
      <div className="s-flex s-w-full s-max-w-3xl s-flex-col s-gap-1 s-p-2 @sm/conversation:s-gap-1 @md/conversation:s-gap-4">
        {children}
      </div>
    </div>
  );
});

ConversationContainer.displayName = "ConversationContainer";

interface ConversationMessageProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof messageVariants> {
  avatarBusy?: boolean;
  buttons?: React.ReactElement<typeof Button>[];
  children?: React.ReactNode;
  citations?: React.ReactElement[];
  isCurrentUser?: boolean;
  isDisabled?: boolean;
  name?: string;
  timestamp?: string;
  completionStatus?: React.ReactNode;
  pictureUrl?: string | React.ReactNode | null;
  renderName?: (name: string | null) => React.ReactNode;
  infoChip?: React.ReactNode;
  type: ConversationMessageType;
}

export type ConversationMessageType = "user" | "agent";

const wrapperVariants = cva("s-flex s-flex-col s-min-w-60 s-w-full s-@container", {
  variants: {
    messageType: {
      agent: "s-pr-0",
      me: "s-items-end s-pl-8",
      user: "s-items-start s-pr-8", 
    },
  },
  defaultVariants: {
    messageType: "agent",
  },
});
const messageVariants = cva("s-flex s-rounded-2xl", {
  variants: {
    type: {
      agent: "s-w-full s-gap-3 s-p-4",
      user: "s-bg-muted-background dark:s-bg-muted-background-night s-px-4 s-py-4 s-gap-2",
    },
  },
  defaultVariants: {
    type: "agent",
  },
});

const buttonsVariants = cva("s-flex s-justify-start s-gap-2", {
  variants: {
    type: {
      user: "s-pt-2 s-justify-end",
      agent: "s-justify-start",
    },
  },
  defaultVariants: {
    type: "agent",
  },
});
/**
 * Parent component for both UserMessage and AgentMessage, to ensure avatar,
 * side buttons and spacing are consistent between the two
 */
export const ConversationMessage = React.forwardRef<
  HTMLDivElement,
  ConversationMessageProps
>(
  (
    {
      avatarBusy = false,
      buttons,
      children,
      citations,
      isCurrentUser = true,
      isDisabled = false,
      name,
      timestamp,
      completionStatus,
      pictureUrl,
      renderName = (name) => <span>{name}</span>,
      infoChip,
      type,
      className,
      ...props
    },
    ref
  ) => {
    let messageType: "agent" | "me" | "user" = "agent";
    if (type === "agent") {
      messageType = "agent";
    } else if (type === "user") {
      messageType = isCurrentUser ? "me" : "user";
    }

    return (
      <div ref={ref} className={cn(wrapperVariants({ messageType }))}>
        <div className={cn(
          messageVariants({ type, className }),
          "s-flex-col @sm:s-flex-row"
        )} {...props}>
          <div className="s-inline-flex s-items-center s-gap-2 @sm:s-hidden">
            <ConversationMessageAvatar
              avatarUrl={pictureUrl}
              name={name}
              isBusy={avatarBusy}
              isDisabled={isDisabled}
              type={type}
            />
            <ConversationMessageTitle name={name} timestamp={timestamp} infoChip={infoChip} completionStatus={completionStatus} renderName={renderName} />
          </div>

          <ConversationMessageAvatar
            className="s-hidden @sm:s-flex"
            avatarUrl={pictureUrl}
            name={name}
            isBusy={avatarBusy}
            type={type}
            isDisabled={isDisabled}
          />

          <div className="s-flex s-flex-col s-gap-3 s-w-full">
            <div className="s-hidden @sm:s-block">
              <ConversationMessageTitle name={name} timestamp={timestamp} infoChip={infoChip} completionStatus={completionStatus} renderName={renderName} />
            </div>

            <ConversationMessageContent citations={citations} type={type}>
              {children}
            </ConversationMessageContent>

            {buttons && (
              <div className={cn(buttonsVariants({ type, className }))}>
                {buttons}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

ConversationMessage.displayName = "ConversationMessage";

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
      className={cn(
        "s-flex s-flex-col s-gap-1",
        className
      )}
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
    {
      avatarUrl,
      isBusy,
      isDisabled,
      name = "",
      className,
      type,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "s-flex s-gap-2 s-p-1 @sm/conversation:s-p-0",
          className
        )}
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
    }
  ) => {
    return (
      <div className="s-inline-flex s-w-full s-justify-between s-gap-0.5">
        <div className="s-inline-flex s-items-baseline s-gap-2 s-text-foreground dark:s-text-foreground-night">
          <span className="s-heading-sm">{renderName(name)}</span>
          <span className="s-heading-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
            {timestamp}
          </span>
          {infoChip && infoChip}
        </div>
        {completionStatus ?? null}
      </div>
    );
  }
);

ConversationMessageTitle.displayName = "ConversationMessageTitle";
