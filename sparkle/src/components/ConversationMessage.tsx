import { Avatar } from "@sparkle/components/Avatar";
import type { Button } from "@sparkle/components/Button";
import { ConversationMessageContent } from "@sparkle/components/ConversationMessages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import { IconButton } from "@sparkle/components/IconButton";
import { DotsHorizontal } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

/** Centered, capped-width column that lays out ConversationMessage turns with responsive gaps. */
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
      <div className="flex w-full max-w-4xl flex-col gap-6 p-2 @sm-conversation:gap-8 @md-conversation:gap-10">
        {children}
      </div>
    </div>
  );
});

ConversationContainer.displayName = "ConversationContainer";

interface ConversationMessageProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof messageVariants> {
  /** Entries of the "…" dropdown menu in the message header; each onClick is invoked when its item is selected. */
  actions?: ConversationMessageAction[];
  /** Shows the avatar in its busy (animated) state, e.g. while the agent is generating. */
  avatarBusy?: boolean;
  /** Buttons rendered below the message (right-aligned for user, left-aligned for agent). */
  buttons?: React.ReactElement<typeof Button>[];
  children?: React.ReactNode;
  /** Citation elements rendered with the message content. */
  citations?: React.ReactElement[];
  isDisabled?: boolean;
  name?: string;
  timestamp?: string;
  /** Status node shown on the right of the header (e.g. agent timing/approval state). */
  completionStatus?: React.ReactNode;
  /** Avatar image URL or custom visual node. */
  pictureUrl?: string | React.ReactNode | null;
  /** Customizes how the sender's name is rendered in the header. */
  renderName?: (name: string | null) => React.ReactNode;
  /** Chip displayed next to the name (e.g. a model or visibility indicator). */
  infoChip?: React.ReactNode;
  /** Whether this is a "user" or "agent" message; drives styling and alignment. */
  type: ConversationMessageType;
}

type ConversationMessageType = "user" | "agent";

interface ConversationMessageAction {
  icon: React.ComponentType | React.ReactNode;
  label: string;
  onClick: () => void;
}

const messageVariants = cva("flex w-full flex-col rounded-2xl", {
  variants: {
    type: {
      user: "bg-muted-background px-5 py-4 gap-2",
      agent: "w-full gap-3",
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
    },
  },
  defaultVariants: {
    type: "agent",
  },
});
/**
 * Parent component for both UserMessage and AgentMessage, to ensure avatar,
 * side buttons and spacing are consistent between the two.
 * @deprecated Use ConversationMessages instead.
 * @summary Legacy single chat message wrapper.
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
      actions,
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
            completionStatus={completionStatus}
            isBusy={avatarBusy}
            isDisabled={isDisabled}
            renderName={renderName}
            infoChip={infoChip}
            actions={actions}
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

interface ConversationMessageHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  actions?: ConversationMessageAction[];
  avatarUrl?: string | React.ReactNode;
  isBusy?: boolean;
  isDisabled?: boolean;
  name?: string;
  timestamp?: string;
  completionStatus?: React.ReactNode;
  infoChip?: React.ReactNode;
  renderName: (name: string | null) => React.ReactNode;
}

const ConversationMessageHeader = React.forwardRef<
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
      completionStatus,
      renderName,
      actions,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-2 p-1 @sm-conversation:p-0",
          className
        )}
        {...props}
      >
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
        <div className="inline-flex w-full justify-between gap-0.5">
          <div className="inline-flex items-baseline gap-2 text-foreground">
            <span className="heading-sm">{renderName(name)}</span>
            <span className="text-xs text-muted-foreground">{timestamp}</span>
            {infoChip && infoChip}
          </div>
          <div className="flex items-center gap-2">
            {completionStatus ?? null}
            {actions && actions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    icon={DotsHorizontal}
                    size="xs"
                    variant="highlight-ghost"
                    aria-label="Message actions"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {actions.map((action, index) => (
                    <DropdownMenuItem
                      key={index}
                      icon={action.icon}
                      label={action.label}
                      onClick={action.onClick}
                    />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    );
  }
);

ConversationMessageHeader.displayName = "ConversationMessageHeader";
