import { cva } from "class-variance-authority";
import React from "react";

import {
  AnimatedText,
  Avatar,
  Button,
  ButtonGroup,
  CitationGrid,
  DataEmojiMart,
  type EmojiMartData,
  EmojiPicker,
} from "@sparkle/components";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@sparkle/components/Popover";
import {
  ChevronRightIcon,
  ClipboardIcon,
  EmotionLaughIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  LinkIcon,
  MoreIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@sparkle/icons/app";
import type { EmojiSkinType } from "@sparkle/lib/avatar/types";
import { cn } from "@sparkle/lib/utils";

type ConversationMessageType = "agent" | "locutor" | "interlocutor";
type MessageType = "agent" | "locutor" | "interlocutor";

type MessageGroupType = "agent" | "locutor" | "interlocutor";
type MessageGroupAlign = "start" | "end";

type MessageReactionData = {
  emoji: string;
  count: number;
  reactedByLocutor: boolean;
};

const messageTypeFromGroupType = (
  type: MessageGroupType
): ConversationMessageType => type;

type MessageGroupContextValue = {
  messageType: ConversationMessageType;
  messageContainerType: MessageType;
} | null;

const messageGroupTypeContext =
  React.createContext<MessageGroupContextValue>(null);

export const NewConversationContainer = React.forwardRef<
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
      <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6">
        {children}
      </div>
    </div>
  );
});

NewConversationContainer.displayName = "NewConversationContainer";

interface NewConversationSectionHeadingProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
}

export const NewConversationSectionHeading = React.forwardRef<
  HTMLDivElement,
  NewConversationSectionHeadingProps
>(({ label, children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-flex s-w-full s-justify-center s-items-center s-gap-3 s-heading-sm s-text-faint dark:s-text-faint-night",
        className
      )}
      {...props}
    >
      {label ?? children}
    </div>
  );
});

NewConversationSectionHeading.displayName = "NewConversationSectionHeading";

interface NewConversationActiveIndicatorProps
  extends React.HTMLAttributes<HTMLDivElement> {
  type: MessageGroupType;
  action: string;
  name?: string;
  avatar?: React.ComponentProps<typeof Avatar>;
}

export const NewConversationActiveIndicator = React.forwardRef<
  HTMLDivElement,
  NewConversationActiveIndicatorProps
>(({ type, action, name, avatar, className, ...props }, ref) => {
  const resolvedName = name ?? (type === "locutor" ? "Me" : "Someone");
  const resolvedAvatar = {
    ...avatar,
    name: avatar?.name ?? resolvedName,
    isRounded: avatar?.isRounded ?? type === "interlocutor",
    size: "xs" as const,
  };

  return (
    <div
      ref={ref}
      className={cn("s-flex s-items-center s-gap-2 s-pl-2", className)}
      {...props}
    >
      <Avatar {...resolvedAvatar} />
      <AnimatedText className="s-text-xs s-font-semibold">
        {resolvedName} is {action}
      </AnimatedText>
    </div>
  );
});

NewConversationActiveIndicator.displayName = "NewConversationActiveIndicator";

const messageGroupVariants = cva("s-flex s-w-full s-flex-col s-gap-1.5", {
  variants: {
    align: {
      start: "s-items-start",
      end: "s-items-end",
    },
  },
  defaultVariants: {
    align: "start",
  },
});

interface NewConversationMessageGroupProps
  extends React.HTMLAttributes<HTMLDivElement> {
  type: MessageGroupType;
  avatar?: React.ComponentProps<typeof Avatar>;
  name?: string;
  timestamp?: string;
  infoChip?: React.ReactNode;
  completionStatus?: React.ReactNode;
  renderName?: (name: string | null) => React.ReactNode;
  hideCompletionStatus?: boolean;
}

export const NewConversationMessageGroup = React.forwardRef<
  HTMLDivElement,
  NewConversationMessageGroupProps
>(
  (
    {
      children,
      className,
      type,
      avatar,
      name,
      timestamp,
      infoChip,
      completionStatus,
      hideCompletionStatus = false,
      renderName = (value) => <span>{value}</span>,
      ...props
    },
    ref
  ) => {
    const align: MessageGroupAlign = type === "locutor" ? "end" : "start";
    const messageType = messageTypeFromGroupType(type);
    const messageContainerType: MessageType = type;

    return (
      <messageGroupTypeContext.Provider
        value={{ messageType, messageContainerType }}
      >
        <div
          ref={ref}
          className={cn(messageGroupVariants({ align, className }))}
          {...props}
        >
          <NewConversationMessageGroupHeader
            groupType={type}
            avatar={avatar}
            name={name}
            type={messageType}
            timestamp={timestamp}
            infoChip={infoChip}
            completionStatus={hideCompletionStatus ? null : completionStatus}
            renderName={renderName}
          />
          {children}
        </div>
      </messageGroupTypeContext.Provider>
    );
  }
);

NewConversationMessageGroup.displayName = "NewConversationMessageGroup";

interface NewConversationMessageGroupHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  groupType: MessageGroupType;
  avatar?: React.ComponentProps<typeof Avatar>;
  name?: string;
  type: ConversationMessageType;
  timestamp?: string;
  infoChip?: React.ReactNode;
  completionStatus?: React.ReactNode;
  renderName: (name: string | null) => React.ReactNode;
}

export const NewConversationMessageGroupHeader = React.forwardRef<
  HTMLDivElement,
  NewConversationMessageGroupHeaderProps
>(
  (
    {
      groupType,
      avatar,
      name = "",
      type,
      timestamp,
      infoChip,
      completionStatus,
      renderName,
      className,
      ...props
    },
    ref
  ) => {
    const isLocutor = groupType === "locutor";
    const resolvedAvatar = {
      ...avatar,
      name: avatar?.name ?? name,
      isRounded: avatar?.isRounded ?? type === "interlocutor",
      size: "sm" as const,
    };

    return (
      <div
        ref={ref}
        className={cn("s-flex s-w-full s-items-center s-gap-2", className)}
        {...props}
      >
        {!isLocutor && <Avatar {...resolvedAvatar} />}
        <div
          className={cn(
            "s-inline-flex s-flex-1 s-items-center s-gap-0.5",
            isLocutor ? "s-justify-end" : "s-justify-between"
          )}
        >
          <div className="s-inline-flex s-items-baseline s-gap-2 s-text-foreground dark:s-text-foreground-night">
            <span className="s-heading-sm">
              {isLocutor ? "Me" : renderName(name)}
            </span>
            <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
              {timestamp}
            </span>
            {infoChip && infoChip}
          </div>
          {completionStatus ? (
            <Button
              label={completionStatus as string}
              icon={ChevronRightIcon}
              size="sm"
              variant="ghost"
            />
          ) : null}
        </div>
      </div>
    );
  }
);

NewConversationMessageGroupHeader.displayName =
  "NewConversationMessageGroupHeader";

interface MessageReactionProps {
  emoji: string;
  count: number;
  reactedByLocutor: boolean;
  onClick?: () => void;
}

export const MessageReaction = ({
  emoji,
  count,
  reactedByLocutor,
  onClick,
}: MessageReactionProps) => {
  return (
    <Button
      size="xs"
      variant={reactedByLocutor ? "highlight-secondary" : "outline"}
      label={`${emoji} ${count}`}
      onClick={onClick}
    />
  );
};

const messageVariants = cva("s-flex s-max-w-full", {
  variants: {
    type: {
      interlocutor:
        "s-rounded-3xl s-bg-muted-background dark:s-bg-muted-background-night s-px-4 s-py-3 s-gap-2 s-w-fit s-rounded-tl-md",
      locutor:
        "s-rounded-3xl s-bg-muted-background dark:s-bg-muted-background-night s-px-4 s-py-3 s-gap-2 s-w-fit s-rounded-tr-md",
      agent: "s-flex-1 s-px-4 s-pt-4",
    },
  },
  defaultVariants: {
    type: "agent",
  },
});

interface NewConversationMessageContainerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  children?: React.ReactNode;
  citations?: React.ReactElement[];
  reactions?: MessageReactionData[];
  messageType?: MessageType;
  type?: ConversationMessageType;
  onEmojiSelect?: (emoji: string) => void;
  onReactionClick?: (emoji: string) => void;
  onDelete?: () => void;
  hideActions?: boolean;
  isLastMessage?: boolean;
}

export const NewConversationMessageContainer = React.forwardRef<
  HTMLDivElement,
  NewConversationMessageContainerProps
>(
  (
    {
      children,
      citations,
      className,
      reactions,
      messageType: _messageType,
      onEmojiSelect,
      onReactionClick,
      onDelete,
      hideActions = false,
      isLastMessage = false,
      type,
      ...props
    },
    ref
  ) => {
    const groupContext = React.useContext(messageGroupTypeContext);
    const resolvedType = type ?? groupContext?.messageType;
    const handleEmojiSelect = onEmojiSelect
      ? (emoji: EmojiSkinType) => onEmojiSelect(emoji.native)
      : undefined;
    const containerRef = React.useRef<HTMLDivElement>(null);
    const contentRef = React.useRef<HTMLDivElement>(null);
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isCollapsible, setIsCollapsible] = React.useState(false);
    const [expandedHeight, setExpandedHeight] = React.useState<number>();
    const collapsedHeight = 240;
    const shouldAutoCollapse =
      resolvedType === "agent" && !isLastMessage && !hideActions;

    const actionsContent = hideActions ? null : (
      <div className="s-flex s-gap-1 s-items-end s-opacity-0 s-transition-opacity group-hover/new-conversation-message:s-opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              icon={MoreIcon}
              size="xs"
              variant="outline"
              aria-label="Message actions"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem label="Copy anchor link" icon={LinkIcon} />
            <DropdownMenuSeparator />
            <DropdownMenuItem label="Edit" icon={PencilSquareIcon} />
            <DropdownMenuItem
              label="Delete"
              variant="warning"
              icon={TrashIcon}
              onClick={onDelete}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <PopoverRoot>
          <PopoverTrigger asChild>
            <Button
              size="xs"
              variant="outline"
              icon={EmotionLaughIcon}
              aria-label="React with emoji"
            />
          </PopoverTrigger>
          <PopoverContent fullWidth>
            <EmojiPicker
              theme="light"
              previewPosition="none"
              data={DataEmojiMart as EmojiMartData}
              onEmojiSelect={handleEmojiSelect ?? (() => undefined)}
            />
          </PopoverContent>
        </PopoverRoot>
      </div>
    );

    React.useLayoutEffect(() => {
      if (!shouldAutoCollapse) {
        setIsCollapsible(false);
        setIsExpanded(false);
        return;
      }

      const contentElement = contentRef.current;
      const containerElement = containerRef.current;
      if (!contentElement || !containerElement) {
        return;
      }

      const measureHeights = () => {
        const fullHeight = contentElement.scrollHeight;
        setExpandedHeight(fullHeight);
        const isOverflowing = fullHeight > collapsedHeight + 1;
        setIsCollapsible(isOverflowing);
        if (!isOverflowing) {
          setIsExpanded(false);
        }
      };

      measureHeights();

      const resizeObserver = new ResizeObserver(() => {
        measureHeights();
      });
      resizeObserver.observe(contentElement);

      return () => {
        resizeObserver.disconnect();
      };
    }, [children, citations, reactions, collapsedHeight, shouldAutoCollapse]);

    const agentActionsContent = hideActions ? null : (
      <div className="s-flex s-items-center s-gap-2 s-opacity-0 s-transition-opacity group-hover/new-conversation-message:s-opacity-100">
        <ButtonGroup removeGaps>
          <Button
            icon={HandThumbUpIcon}
            size="xs"
            variant="outline"
            aria-label="Thumbs up"
          />
          <Button
            icon={HandThumbDownIcon}
            size="xs"
            variant="outline"
            aria-label="Thumbs down"
          />
        </ButtonGroup>
        <Button
          icon={ClipboardIcon}
          size="xs"
          variant="outline"
          aria-label="Copy"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              icon={MoreIcon}
              size="xs"
              variant="outline"
              aria-label="More actions"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem label="Copy anchor link" icon={LinkIcon} />
            <DropdownMenuSeparator />
            <DropdownMenuItem label="Edit" icon={PencilSquareIcon} />
            <DropdownMenuItem
              label="Delete"
              variant="warning"
              icon={TrashIcon}
              onClick={onDelete}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );

    const collapseToggle =
      shouldAutoCollapse && isCollapsible ? (
        <Button
          size="xs"
          variant="outline"
          icon={isExpanded ? FullscreenExitIcon : FullscreenIcon}
          label={isExpanded ? "Show less" : "Show all"}
          onClick={() => setIsExpanded((value) => !value)}
          aria-expanded={isExpanded}
        />
      ) : null;

    return (
      <div
        ref={ref}
        className={cn(
          "s-group/new-conversation-message s-flex s-flex-col s-w-full s-gap-2",
          resolvedType === "locutor" ? "s-items-end" : "s-items-start"
        )}
      >
        <div
          className={cn(
            "s-flex s-gap-1",
            resolvedType === "agent" && "s-w-full"
          )}
        >
          {resolvedType === "locutor" && actionsContent}
          <div
            className={cn(messageVariants({ type: resolvedType, className }))}
            {...props}
          >
            <div
              ref={containerRef}
              style={
                shouldAutoCollapse && isCollapsible
                  ? {
                      maxHeight: isExpanded
                        ? (expandedHeight ?? collapsedHeight)
                        : collapsedHeight,
                      overflow: "hidden",
                      transition: "max-height 200ms ease",
                    }
                  : undefined
              }
            >
              <div ref={contentRef}>
                <NewConversationMessageContent
                  citations={citations}
                  reactions={reactions}
                  onReactionClick={onReactionClick}
                >
                  {children}
                </NewConversationMessageContent>
              </div>
            </div>
          </div>
          {resolvedType === "interlocutor" && actionsContent}
        </div>
        {resolvedType === "agent" &&
          (agentActionsContent || collapseToggle) && (
            <div
              className={cn(
                "s-flex s-w-full s-items-center s-gap-6",
                shouldAutoCollapse &&
                  isCollapsible &&
                  "s-border-t s-border-border dark:s-border-border-night s-pt-2"
              )}
            >
              {collapseToggle}
              {agentActionsContent}
            </div>
          )}
      </div>
    );
  }
);

NewConversationMessageContainer.displayName = "NewConversationMessageContainer";

interface NewConversationMessageContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  citations?: React.ReactElement[];
  reactions?: MessageReactionData[];
  type?: ConversationMessageType;
  infoChip?: React.ReactNode;
  onReactionClick?: (emoji: string) => void;
}

export const NewConversationMessageContent = React.forwardRef<
  HTMLDivElement,
  NewConversationMessageContentProps
>(
  (
    { children, citations, reactions, className, onReactionClick, ...props },
    ref
  ) => {
    const reactionsContent =
      reactions && reactions.length > 0 ? (
        <div className="s-flex s-flex-wrap s-gap-1 s-my-1">
          {reactions.map((reaction) => (
            <MessageReaction
              key={reaction.emoji}
              emoji={reaction.emoji}
              count={reaction.count}
              reactedByLocutor={reaction.reactedByLocutor}
              onClick={
                onReactionClick
                  ? () => onReactionClick(reaction.emoji)
                  : undefined
              }
            />
          ))}
        </div>
      ) : null;
    return (
      <div
        ref={ref}
        className={cn(
          "s-flex s-min-w-0 s-flex-1 s-flex-col s-gap-1",
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
        {reactionsContent}
      </div>
    );
  }
);

NewConversationMessageContent.displayName = "NewConversationMessageContent";
