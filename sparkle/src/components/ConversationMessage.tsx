import { cva, VariantProps } from "class-variance-authority";
import React from "react";

import { Avatar, Button, CitationGrid } from "@sparkle/components";
import { cn } from "@sparkle/lib/utils";

const conversationContainerVariants = cva(
  "s-w-full s-@container/conversation",
  {
    variants: {
      padding: {
        none: "",
        default: "s-px-1 @[32rem]/conversation:s-px-4",
      },
    },
    defaultVariants: {
      padding: "default",
    },
  }
);

const messageVariants = cva(
  "s-mt-2 s-flex s-w-full s-flex-col s-gap-4 s-rounded-3xl s-p-3 @[32rem]/conversation:s-p-4",
  {
    variants: {
      type: {
        user: "s-bg-muted-background s-w-full @[32rem]/conversation:s-w-[calc(100%-8rem)] @[32rem]/conversation:s-ml-[8rem]",
        agent: "",
      },
    },
    defaultVariants: {
      type: "agent",
    },
  }
);

const messageContentVariants = cva(
  "s-flex s-flex-col s-gap-3 @[32rem]/conversation:s-gap-4",
  {
    variants: {},
  }
);

const messageHeaderVariants = cva(
  "s-flex s-items-center s-gap-2 s-p-1 @[32rem]/conversation:s-p-0",
  {
    variants: {},
  }
);

export const ConversationContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div className="s-w-full">
      <div
        ref={ref}
        className={cn(conversationContainerVariants({}), className)}
        {...props}
      >
        <div className="s-flex s-w-full s-flex-col s-gap-4">{children}</div>
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
      className={cn(messageContentVariants({}), className)}
      {...props}
    >
      <div
        className={cn(
          "s-px-2 s-text-sm s-text-foreground @sm:s-text-base @md:s-px-4"
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
      className={cn(messageHeaderVariants({}), className)}
      {...props}
    >
      <Avatar
        className="@md:s-hidden"
        name={name}
        visual={avatarUrl}
        busy={isBusy}
        size="xs"
      />
      <Avatar
        className="s-hidden @md:s-flex"
        name={name}
        visual={avatarUrl}
        busy={isBusy}
        size="sm"
      />
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "s-text-sm s-font-medium s-text-foreground @md:s-pb-1 @md:s-text-base"
          )}
        >
          {renderName(name)}
        </div>
      </div>
    </div>
  );
});

ConversationMessageHeader.displayName = "ConversationMessageHeader";
