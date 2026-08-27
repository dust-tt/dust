import { Avatar } from "@sparkle/components/Avatar";
import { CARD_SHADOW } from "@sparkle/components/Card";
import { CitationGrid } from "@sparkle/components/Citation";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React from "react";

type ConversationMessageType = "user" | "agent";
type MessageType = "me" | "user" | "agent";

const wrapperVariants = cva("flex flex-col @container @xs:flex-row", {
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
      user: "gap-2 w-fit",
      agent: "w-full gap-3 flex-col",
    },
  },
  defaultVariants: {
    type: "agent",
  },
});

interface ConversationMessageContainerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Who the message belongs to relative to the viewer ("me", "user", or "agent"); drives horizontal alignment. */
  messageType: MessageType;
  /** Whether this is a "user" or "agent" message; drives bubble layout. */
  type: ConversationMessageType;
}

// This component should only contain padding (inside the bubble).
// Any margin (inter-message spacing) should live outside of Sparkle.
/**
 * The wrapper for one turn of a chat thread, aligning and styling user vs.
 * agent messages. Compose it with ConversationMessageAvatar,
 * ConversationMessageTitle, and ConversationMessageContent to render a full
 * conversation between people and agents; set both messageType and type so
 * messages are styled and aligned correctly.
 * @summary Chat message turn wrapper.
 */
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

interface ConversationMessageContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Citation elements rendered in a CitationGrid — above the bubble for user messages, below the text for agent messages. */
  citations?: React.ReactElement[];
  /** Whether this is a "user" or "agent" message; drives bubble styling and citation placement. */
  type: ConversationMessageType;
  infoChip?: React.ReactNode;
  /** Reverses the citation grid order (user messages only). */
  reversed?: boolean;
  /** Set to false to render only the citations without the message body. */
  showContent?: boolean;
}

/** Body of a chat message — the message text (e.g. Markdown) plus an optional citations grid. */
export const ConversationMessageContent = React.forwardRef<
  HTMLDivElement,
  ConversationMessageContentProps
>(
  (
    {
      children,
      citations,
      className,
      type,
      reversed,
      showContent = true,
      ...props
    },
    ref
  ) => {
    return (
      <>
        {type === "user" && citations && citations.length > 0 && (
          <CitationGrid reversed={reversed}>{citations}</CitationGrid>
        )}
        {showContent && (
          <div
            ref={ref}
            className={cn(
              "flex min-w-0 flex-col gap-1",
              type === "user" &&
                cn(
                  "rounded-3xl border border-gray-100 bg-gray-50 px-3 py-2",
                  CARD_SHADOW
                ),
              className
            )}
            {...props}
          >
            <div className="min-w-0 break-words text-base text-foreground">
              {children}
            </div>
            {type === "agent" && citations && citations.length > 0 && (
              <CitationGrid>{citations}</CitationGrid>
            )}
          </div>
        )}
      </>
    );
  }
);

ConversationMessageContent.displayName = "ConversationMessageContent";

interface ConversationMessageAvatarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Avatar image URL or custom visual node. */
  avatarUrl?: string | React.ReactNode;
  /** Shows the avatar in its busy (animated) state, e.g. while the agent is generating. */
  isBusy?: boolean;
  isDisabled?: boolean;
  name?: string;
  /** "user" avatars are rounded; "agent" avatars are squared. */
  type: ConversationMessageType;
}

/** Sender avatar for a chat message, rounded for users and squared for agents. */
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
          name={name}
          visual={avatarUrl}
          busy={isBusy}
          disabled={isDisabled}
          isRounded={type === "user"}
          size="xs"
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
  /** Chip displayed next to the name (e.g. a model or visibility indicator). */
  infoChip?: React.ReactNode;
  /** Status node shown on the right (e.g. agent timing/approval state) — prefer it over custom labels. */
  completionStatus?: React.ReactNode;
  /** Customizes how the sender's name is rendered. */
  renderName: (name: string | null) => React.ReactNode;
}

/** Header line of a chat message: sender name, timestamp, optional infoChip and completionStatus. */
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
        <div className="inline-flex items-baseline gap-2 text-foreground">
          <span className="text-sm font-medium">{renderName(name)}</span>
          <span className="text-xs text-muted-foreground">{timestamp}</span>
          {infoChip && (
            <div className="inline-flex self-center">{infoChip}</div>
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
