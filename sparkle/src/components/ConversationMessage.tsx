import React from "react";

import { Avatar, Button, CitationGrid } from "@sparkle/components";
import { cn } from "@sparkle/lib/utils";

type ConversationMessageType = "agent" | "user";

const messageTypeClasses: Record<ConversationMessageType, string> = {
  user: "s-bg-muted-background",
  agent: "",
};

export const ConversationContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("s-w-full s-@container", className)}
      {...props}
    >
      <div className="s-flex s-w-full s-flex-col s-gap-4 s-px-1 @md:s-gap-6 @md:s-px-4">
        {children}
      </div>
    </div>
  );
});

ConversationContainer.displayName = "ConversationContainer";

interface ConversationMessageProps
  extends React.HTMLAttributes<HTMLDivElement> {
  avatarBusy?: boolean;
  buttons?: React.ReactElement<typeof Button>[];
  children?: React.ReactNode;
  citations?: React.ReactElement[];
  name: string | null;
  pictureUrl?: string | React.ReactNode | null;
  renderName?: (name: string | null) => React.ReactNode;
  type: ConversationMessageType;
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
        className={cn(
          "s-mt-2 s-flex s-w-full s-flex-col s-justify-stretch s-gap-4 s-rounded-3xl s-p-3 @md:s-p-4",
          messageTypeClasses[type],
          className
        )}
        {...props}
      >
        <ConversationMessageHeader
          avatarUrl={pictureUrl}
          name={name ?? undefined}
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
        "s-flex s-flex-col s-justify-stretch s-gap-3 @md:s-gap-4",
        className
      )}
      {...props}
    >
      <div className={cn("s-px-2 s-text-sm s-text-foreground @sm:s-text-base")}>
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
      className={cn("s-flex s-items-center s-gap-2", className)}
      {...props}
    >
      <Avatar name={name} visual={avatarUrl} busy={isBusy} size="md" />
      <div className="flex items-center gap-2">
        <div
          className={cn("s-pb-1 s-text-base s-font-medium s-text-foreground")}
        >
          {renderName(name)}
        </div>
      </div>
    </div>
  );
});

ConversationMessageHeader.displayName = "ConversationMessageHeader";
