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
      <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6 s-p-2 @sm/conversation:s-gap-8 @md/conversation:s-gap-10">
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
  name?: string;
  pictureUrl?: string | React.ReactNode | null;
  renderName?: (name: string | null) => React.ReactNode;
}

const messageVariants = cva(
  "s-flex s-w-full s-flex-col s-gap-4 s-rounded-3xl s-p-3 @sm/conversation:s-p-4",
  {
    variants: {
      type: {
        user: "s-bg-muted-background dark:s-bg-muted-background-night",
        agent: "s-w-full",
      },
    },
    defaultVariants: {
      type: "agent",
    },
  }
);
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
      name,
      pictureUrl,
      renderName = (name) => <span>{name}</span>,
      type,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(messageVariants({ type, className }))}
        {...props}
      >
        <ConversationMessageHeader
          avatarUrl={pictureUrl}
          name={name}
          isBusy={avatarBusy}
          renderName={renderName}
        />

        <ConversationMessageContent citations={citations}>
          {children}
        </ConversationMessageContent>
        {buttons && (
          <div className="s-flex s-justify-end s-gap-2">{buttons}</div>
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
        className={cn(
          "s-px-2 s-text-sm @sm:s-text-base @md:s-px-4",
          "s-text-foreground dark:s-text-foreground-night"
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
  name?: string;
  renderName: (name: string | null) => React.ReactNode;
}

export const ConversationMessageHeader = React.forwardRef<
  HTMLDivElement,
  ConversationMessageHeaderProps
>(({ avatarUrl, isBusy, name = "", renderName, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-flex s-items-center s-gap-2 s-p-1 @sm/conversation:s-p-0",
        className
      )}
      {...props}
    >
      <Avatar
        className="@sm:s-hidden"
        name={name}
        visual={avatarUrl}
        busy={isBusy}
        size="xs"
      />
      <Avatar
        className="s-hidden @sm:s-flex"
        name={name}
        visual={avatarUrl}
        busy={isBusy}
        size="sm"
      />
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "s-text-sm s-font-medium @sm:s-pb-1 @sm:s-text-base",
            "s-text-foreground dark:s-text-foreground-night"
          )}
        >
          {renderName(name)}
        </div>
      </div>
    </div>
  );
});

ConversationMessageHeader.displayName = "ConversationMessageHeader";
