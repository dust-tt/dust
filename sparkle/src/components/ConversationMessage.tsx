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
        "s-flex s-h-full s-w-full s-flex-col s-items-center s-@container/conversation",
        className
      )}
      {...props}
    >
      <div className="s-flex s-w-full s-max-w-3xl s-flex-col s-gap-6 s-p-2 @sm/conversation:s-gap-8 @md/conversation:s-gap-10">
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
  isDisabled?: boolean;
  name?: string;
  timestamp?: string;
  completionStatus?: React.ReactNode;
  pictureUrl?: string | React.ReactNode | null;
  renderName?: (name: string | null) => React.ReactNode;
  infoChip?: React.ReactNode;
  type: ConversationMessageType;
}

export type ConversationMessageType = "user" | "agent" | "agentAsTool";

const messageVariants = cva("s-flex s-w-full s-flex-col s-rounded-2xl", {
  variants: {
    type: {
      user: "s-bg-muted-background dark:s-bg-muted-background-night s-px-5 s-py-4 s-gap-2",
      agent: "s-w-full s-gap-3",
      agentAsTool:
        "s-w-full s-gap-5 s-border s-border-border dark:s-border-border-night s-rounded-2xl s-px-5 s-py-5",
    },
  },
  defaultVariants: {
    type: "agent",
  },
});

const buttonsVariants = cva("s-flex s-justify-start s-gap-2 s-pt-2", {
  variants: {
    type: {
      user: "s-justify-end",
      agent: "s-justify-start",
      agentAsTool: "s-justify-start",
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
    return (
      <div ref={ref} className="s-group/message">
        <div className={cn(messageVariants({ type, className }))} {...props}>
          <ConversationMessageHeader
            avatarUrl={pictureUrl}
            name={name}
            timestamp={timestamp}
            completionStatus={completionStatus}
            isBusy={avatarBusy}
            isDisabled={isDisabled}
            renderName={renderName}
            infoChip={infoChip}
            type={type}
          />

          <ConversationMessageContent citations={citations} type={type}>
            {children}
          </ConversationMessageContent>
        </div>
        {buttons && (
          <div className={cn(buttonsVariants({ type, className }))}>
            {buttons}
          </div>
        )}
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
}

export const ConversationMessageContent = React.forwardRef<
  HTMLDivElement,
  ConversationMessageContentProps
>(({ children, citations, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-flex s-flex-col s-gap-3 @sm/conversation:s-gap-4",
        className
      )}
      {...props}
    >
      <div
        className="s-text-base s-text-foreground dark:s-text-foreground-night"
      >
        {children}
      </div>
      {citations && citations.length > 0 && (
        <CitationGrid>{citations}</CitationGrid>
      )}
    </div>
  );
});

ConversationMessageContent.displayName = "ConversationMessageContent";

interface ConversationMessageHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  avatarUrl?: string | React.ReactNode;
  isBusy?: boolean;
  isDisabled?: boolean;
  name?: string;
  timestamp?: string;
  completionStatus?: React.ReactNode;
  infoChip?: React.ReactNode;
  renderName: (name: string | null) => React.ReactNode;
  type: ConversationMessageType;
}

export const ConversationMessageHeader = React.forwardRef<
  HTMLDivElement,
  ConversationMessageHeaderProps
>(
  (
    {
      avatarUrl,
      isBusy,
      isDisabled,
      name = "",
      timestamp,
      infoChip,
      type,
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
          "s-flex s-items-center s-gap-2 s-p-1 @sm/conversation:s-p-0",
          className
        )}
        {...props}
      >
        {type !== "agentAsTool" && (
          <>
            <Avatar
              className="@sm:s-hidden"
              name={name}
              visual={avatarUrl}
              busy={isBusy}
              disabled={isDisabled}
              size="xs"
            />
            <Avatar
              className="s-hidden @sm:s-flex"
              name={name}
              visual={avatarUrl}
              busy={isBusy}
              disabled={isDisabled}
              size="sm"
            />
          </>
        )}
        <div className="s-flex s-w-full s-flex-row s-justify-between s-gap-0.5">
          <div
            className="s-heading-sm s-text-foreground dark:s-text-foreground-night s-flex s-flex-row s-items-center s-gap-2"
          >
            {renderName(name)}
            {infoChip}
            <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
              {timestamp}
            </span>
          </div>
          {completionStatus ?? null}
        </div>
      </div>
    );
  }
);

ConversationMessageHeader.displayName = "ConversationMessageHeader";
