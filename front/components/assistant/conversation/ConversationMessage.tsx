import type { Button } from "@dust-tt/sparkle";
import { Avatar, CitationGrid } from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import React from "react";

export const ConversationContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex h-full w-full flex-col items-center @container/conversation",
        className
      )}
      {...props}
    >
      <div className="flex w-full max-w-3xl flex-col gap-6 p-2 @sm/conversation:gap-8 @md/conversation:gap-10">
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
  pictureUrl?: string | React.ReactNode | null;
  renderName?: (name: string | null) => React.ReactNode;
  infoChip?: React.ReactNode;
  type: ConversationMessageType;
}

export type ConversationMessageType = "user" | "agent" | "agentAsTool";

const messageVariants = cva("flex w-full flex-col rounded-2xl", {
  variants: {
    type: {
      user: "bg-muted-background dark:bg-muted-background-night px-5 py-4 gap-2",
      agent: "w-full gap-3",
      agentAsTool:
        "w-full gap-3 border border-border dark:border-border-night rounded-2xl px-5 py-5",
    },
  },
  defaultVariants: {
    type: "agent",
  },
});

const buttonsVariants = cva("flex justify-start gap-2 pt-2", {
  variants: {
    type: {
      user: "justify-end",
      agent: "justify-start",
      agentAsTool: "justify-start",
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
      <div ref={ref} className="group/message">
        <div className={cn(messageVariants({ type, className }))} {...props}>
          <ConversationMessageHeader
            avatarUrl={pictureUrl}
            name={name}
            timestamp={timestamp}
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
>(({ children, citations, className, type, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-3 @sm/conversation:gap-4", className)}
      {...props}
    >
      <div
        className={cn(
          "text-sm @sm:text-base",
          "text-foreground dark:text-foreground-night",
          type !== "agentAsTool" && "@md:px-4"
        )}
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
          "flex items-center gap-2 p-1 @sm/conversation:p-0",
          className
        )}
        {...props}
      >
        {type !== "agentAsTool" && (
          <>
            <Avatar
              className="@sm:hidden"
              name={name}
              visual={avatarUrl}
              busy={isBusy}
              disabled={isDisabled}
              size="xs"
            />
            <Avatar
              className="hidden @sm:flex"
              name={name}
              visual={avatarUrl}
              busy={isBusy}
              disabled={isDisabled}
              size="sm"
            />
          </>
        )}
        <div className="flex w-full flex-row justify-between gap-0.5">
          <div
            className={cn(
              "heading-sm @sm:text-base",
              "text-foreground dark:text-foreground-night",
              "flex flex-row items-center gap-2"
            )}
          >
            {renderName(name)}
            {infoChip}
            <span className="text-xs font-normal text-muted-foreground dark:text-muted-foreground-night">
              {timestamp}
            </span>
          </div>
        </div>
      </div>
    );
  }
);

ConversationMessageHeader.displayName = "ConversationMessageHeader";
