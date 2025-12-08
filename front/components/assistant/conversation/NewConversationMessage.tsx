import type { Button, ConversationMessageAction } from "@dust-tt/sparkle";
import { Avatar, CitationGrid, cn } from "@dust-tt/sparkle";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import React from "react";

type ConversationMessageType = "user" | "agent";
type MessageType = "me" | "user" | "agent";

interface NewConversationMessageProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof messageVariants> {
  actions?: ConversationMessageAction[];
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

const wrapperVariants = cva("flex flex-col min-w-60 w-full @container", {
  variants: {
    messageType: {
      agent: "pr-0 mt-3",
      me: "items-end pl-9",
      user: "items-start pr-9",
    },
  },
  defaultVariants: {
    messageType: "agent",
  },
});
const messageVariants = cva("flex rounded-2xl max-w-full", {
  variants: {
    type: {
      user: "gap-2",
      agent: "w-full gap-2",
    },
  },
  defaultVariants: {
    type: "agent",
  },
});

// const buttonsVariants = cva("flex justify-start gap-3", {
//   variants: {
//     type: {
//       user: "pt-2 justify-end",
//       agent: "justify-start",
//     },
//   },
//   defaultVariants: {
//     type: "agent",
//   },
// });

/**
 * This is a temporary duplicate of the ConversationMessage component
 * to ensure the UI is consistent between the new conversation view and the old conversation view.
 * This will be moved to the ConversationMessage component once 'mentions_v2' feature flag is enabled.
 */
export const NewConversationMessage = React.forwardRef<
  HTMLDivElement,
  NewConversationMessageProps
>(
  (
    {
      actions,
      avatarBusy = false,
      // buttons,
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
    let messageType: MessageType = "agent";
    if (type === "agent") {
      messageType = "agent";
    } else if (type === "user") {
      messageType = isCurrentUser ? "me" : "user";
    }

    const showAvatar = messageType !== "me";

    return (
      <div ref={ref} className={cn(wrapperVariants({ messageType }))}>
        {showAvatar && (
          <ConversationMessageTitle
            className="heading-sm mb-1 hidden pl-[50px] @sm:flex"
            name={name}
            timestamp={timestamp}
            infoChip={infoChip}
            completionStatus={completionStatus}
            renderName={renderName}
            actions={actions}
          />
        )}
        <div
          className={cn(
            messageVariants({ type, className })
            // "flex-col @sm:flex-row"
          )}
          {...props}
        >
          {showAvatar && (
            <div className="inline-flex items-center gap-2 pt-2 @sm:hidden">
              <ConversationMessageAvatar
                avatarUrl={pictureUrl}
                name={name}
                isBusy={avatarBusy}
                isDisabled={isDisabled}
                type={type}
              />
            </div>
          )}

          {showAvatar && (
            <ConversationMessageAvatar
              className="mt-1 hidden @sm:flex"
              avatarUrl={pictureUrl}
              name={name}
              isBusy={avatarBusy}
              type={type}
              isDisabled={isDisabled}
            />
          )}

          <div
            className={cn(
              "flex w-full min-w-0 flex-col",
              type === "user"
                ? "gap-1 rounded-xl bg-muted-background px-3 py-2 dark:bg-muted-background-night"
                : "gap-3 px-3 py-1"
            )}
          >
            <ConversationMessageContent citations={citations} type={type}>
              {children}
            </ConversationMessageContent>

            {/* {buttons && (
              <div className={cn(buttonsVariants({ type, className }))}>
                {buttons}
              </div>
            )} */}
          </div>
        </div>
      </div>
    );
  }
);

NewConversationMessage.displayName = "NewConversationMessage";

interface ConversationMessageContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  citations?: React.ReactElement[];
  type: ConversationMessageType;
  infoChip?: React.ReactNode;
}

const ConversationMessageContent = React.forwardRef<
  HTMLDivElement,
  ConversationMessageContentProps
>(({ children, citations, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
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

const ConversationMessageAvatar = React.forwardRef<
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
        className={cn("flex gap-2 @sm/conversation:p-0", className)}
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
  actions?: ConversationMessageAction[];
  name?: string;
  timestamp?: string;
  infoChip?: React.ReactNode;
  completionStatus?: React.ReactNode;
  renderName: (name: string | null) => React.ReactNode;
}

const ConversationMessageTitle = React.forwardRef<
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
      // actions,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn("inline-flex w-full justify-between gap-0.5", className)}
        {...props}
      >
        <div className="inline-flex items-center gap-2 text-xs font-normal text-muted-foreground dark:text-muted-foreground-night">
          <span className="">{renderName(name)}</span>
          <span className="">{timestamp}</span>
          {infoChip && (
            <div className="inline-flex items-center gap-2">{infoChip}</div>
          )}
        </div>
        <div className="inline-flex items-center gap-2">
          {completionStatus ?? null}
          {/* {actions && actions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  icon={MoreIcon}
                  size="xs"
                  variant="highlight-secondary"
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
          )} */}
        </div>
      </div>
    );
  }
);

ConversationMessageTitle.displayName = "ConversationMessageTitle";
