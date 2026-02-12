import { cva } from "class-variance-authority";
import React from "react";

import {
  AnimatedText,
  Avatar,
  Button,
  ButtonGroup,
  DataEmojiMart,
  type EmojiMartData,
  EmojiPicker,
  NewCitationGrid,
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

/** Width threshold: message container width >= this uses "default" size, below uses "compact". */
const MESSAGE_CONTAINER_DEFAULT_MIN_WIDTH = 500;

export type MessageContainerSize = "compact" | "default";

const MessageContainerSizeContext =
  React.createContext<MessageContainerSize | null>(null);

export function useMessageContainerSize(): MessageContainerSize {
  const size = React.useContext(MessageContainerSizeContext);
  return size ?? "default";
}

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
      <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-4 s-px-2 @sm:s-px-4">
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

const messageGroupVariants = cva("s-flex s-w-full s-flex-col s-gap-1", {
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
      size: "xs" as const,
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
        "s-rounded-3xl s-bg-muted-background dark:s-bg-muted-background-night s-px-4 s-gap-2 s-w-fit",
      locutor:
        "s-rounded-3xl s-bg-muted-background dark:s-bg-muted-background-night s-px-4 s-gap-2 s-w-fit",
      agent: "s-flex-1 s-px-4",
    },
  },
  defaultVariants: {
    type: "agent",
  },
});

// --- Shared collapsible content hook ---

interface UseCollapsibleContentOptions {
  enabled: boolean;
  collapseThreshold?: number;
  collapsedHeight?: number;
  deps: React.DependencyList;
}

function useCollapsibleContent({
  enabled,
  collapseThreshold = 420,
  collapsedHeight = 320,
  deps,
}: UseCollapsibleContentOptions) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isCollapsible, setIsCollapsible] = React.useState(false);
  const [expandedHeight, setExpandedHeight] = React.useState<number>();

  React.useLayoutEffect(() => {
    if (!enabled) {
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
      const isOverflowing = fullHeight > collapseThreshold + 1;
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
  }, [enabled, collapseThreshold, ...deps]);

  return {
    containerRef,
    contentRef,
    isExpanded,
    setIsExpanded,
    isCollapsible,
    expandedHeight,
    collapsedHeight,
  };
}

// --- User message (locutor / interlocutor) ---

type UserMessageType = "locutor" | "interlocutor";

interface NewConversationUserMessageProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  children?: React.ReactNode;
  citations?: React.ReactElement[];
  reactions?: MessageReactionData[];
  type?: UserMessageType;
  onEmojiSelect?: (emoji: string) => void;
  onReactionClick?: (emoji: string) => void;
  onDelete?: () => void;
  onEdit?: (newContent: string) => void;
  defaultEditValue?: string;
  hideActions?: boolean;
  isLastMessage?: boolean;
}

export const NewConversationUserMessage = React.forwardRef<
  HTMLDivElement,
  NewConversationUserMessageProps
>(
  (
    {
      children,
      citations,
      className,
      reactions,
      onEmojiSelect,
      onReactionClick,
      onDelete,
      onEdit,
      defaultEditValue = "",
      hideActions = false,
      isLastMessage = false,
      type,
      ...props
    },
    ref
  ) => {
    const groupContext = React.useContext(messageGroupTypeContext);
    const resolvedType = (type ??
      groupContext?.messageType ??
      "interlocutor") as UserMessageType;

    const handleEmojiSelect = onEmojiSelect
      ? (emoji: EmojiSkinType) => onEmojiSelect(emoji.native)
      : undefined;

    const shouldAutoCollapse = !isLastMessage && !hideActions;

    const {
      containerRef,
      contentRef,
      isExpanded,
      setIsExpanded,
      isCollapsible,
      expandedHeight,
      collapsedHeight,
    } = useCollapsibleContent({
      enabled: shouldAutoCollapse,
      deps: [children, reactions],
    });

    const messageContainerSizeRef = React.useRef<HTMLDivElement>(null);
    const [messageContainerSize, setMessageContainerSize] =
      React.useState<MessageContainerSize>("default");

    React.useEffect(() => {
      const el = messageContainerSizeRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      const update = () => {
        setMessageContainerSize(
          el.clientWidth >= MESSAGE_CONTAINER_DEFAULT_MIN_WIDTH
            ? "default"
            : "compact"
        );
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // Edit mode state.
    const [isEditing, setIsEditing] = React.useState(false);
    const [editValue, setEditValue] = React.useState("");
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const resizeTextarea = React.useCallback(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight}px`;
      }
    }, []);

    React.useLayoutEffect(() => {
      if (isEditing) {
        resizeTextarea();
        textareaRef.current?.focus();
      }
    }, [isEditing, resizeTextarea]);

    const handleEditStart = () => {
      setEditValue(defaultEditValue);
      setIsEditing(true);
    };

    const handleEditSave = () => {
      onEdit?.(editValue);
      setIsEditing(false);
    };

    const handleEditCancel = () => {
      setEditValue("");
      setIsEditing(false);
    };

    const canEdit = resolvedType === "locutor" && !!onEdit;

    const userCollapsible = shouldAutoCollapse && isCollapsible;
    const hasReactions = reactions && reactions.length > 0;
    const hasBottomBar = !isEditing && (userCollapsible || hasReactions);

    const actionsButtons =
      hideActions || isEditing ? null : (
        <ButtonGroup>
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
              {canEdit && (
                <DropdownMenuItem
                  label="Edit"
                  icon={PencilSquareIcon}
                  onClick={handleEditStart}
                />
              )}
              <DropdownMenuItem
                label="Delete"
                variant="warning"
                icon={TrashIcon}
                onClick={onDelete}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      );

    const actionsContent = (visible: boolean) =>
      actionsButtons ? (
        <div
          className={cn(
            "s-flex s-gap-1 s-items-end s-opacity-0 s-transition-opacity",
            visible && "group-hover/new-conversation-message:s-opacity-100"
          )}
        >
          {actionsButtons}
        </div>
      ) : null;

    return (
      <MessageContainerSizeContext.Provider value={messageContainerSize}>
        <div
          ref={ref}
          className={cn(
            "s-group/new-conversation-message s-flex s-flex-col s-w-full",
            resolvedType === "locutor" ? "s-items-end" : "s-items-start"
          )}
        >
          {citations && citations.length > 0 && (
            <NewCitationGrid
              className="s-pb-1 s-w-full"
              justify={resolvedType === "locutor" ? "end" : "start"}
            >
              {citations.map((c) =>
                React.cloneElement(c, { variant: "primary" })
              )}
            </NewCitationGrid>
          )}
          <div className={cn("s-flex s-gap-1", isEditing && "s-w-full")}>
            {resolvedType === "locutor" && actionsContent(!hasBottomBar)}
            <div
              className={cn(
                "s-flex s-flex-col s-gap-1",
                isEditing && "s-w-full"
              )}
            >
              <div
                ref={messageContainerSizeRef}
                className={cn(
                  messageVariants({ type: resolvedType, className }),
                  userCollapsible && "s-flex-col",
                  isEditing &&
                    "s-w-full s-mt-3 s-flex-col s-border s-border-highlight-300 s-ring-2 s-ring-highlight-300/50"
                )}
                {...props}
              >
                {isEditing ? (
                  <div className="s-py-3">
                    <textarea
                      ref={textareaRef}
                      value={editValue}
                      onChange={(e) => {
                        setEditValue(e.target.value);
                        resizeTextarea();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          handleEditCancel();
                        }
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          handleEditSave();
                        }
                      }}
                      className="s-w-full s-resize-none s-bg-transparent s-text-base s-text-foreground dark:s-text-foreground-night s-outline-none s-border-none s-p-0 focus:s-outline-none focus:s-ring-0"
                      rows={1}
                    />
                  </div>
                ) : (
                  <div
                    ref={containerRef}
                    className={cn(
                      shouldAutoCollapse && isCollapsible && "s-relative"
                    )}
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
                        reactions={userCollapsible ? undefined : reactions}
                        onReactionClick={onReactionClick}
                      >
                        {children}
                      </NewConversationMessageContent>
                    </div>
                    {shouldAutoCollapse && isCollapsible && (
                      <div
                        className={cn(
                          "s-pointer-events-none s-absolute s-bottom-0 s-left-0 s-right-0 s-h-12 s-bg-gradient-to-b s-from-transparent s-transition-opacity",
                          isExpanded
                            ? "s-opacity-0"
                            : "s-to-muted-background dark:s-to-muted-background-night s-opacity-80"
                        )}
                      />
                    )}
                  </div>
                )}
              </div>
              {isEditing ? (
                <div className="s-flex s-justify-end s-gap-2 s-px-3 s-mb-3 s-mt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    label="Cancel"
                    onClick={handleEditCancel}
                  />
                  <Button
                    size="sm"
                    variant="highlight"
                    label="Save"
                    onClick={handleEditSave}
                  />
                </div>
              ) : (
                hasBottomBar && (
                  <div className="s-flex s-flex-wrap s-items-center s-gap-1 s-px-3">
                    {userCollapsible && (
                      <Button
                        size="xs"
                        variant="outline"
                        icon={isExpanded ? FullscreenExitIcon : FullscreenIcon}
                        label={isExpanded ? "Show less" : "Show more"}
                        onClick={() => setIsExpanded((v) => !v)}
                        aria-expanded={isExpanded}
                      />
                    )}
                    {hasReactions &&
                      reactions.map((reaction) => (
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
                    {actionsContent(true)}
                  </div>
                )
              )}
            </div>
            {resolvedType === "interlocutor" &&
              !isEditing &&
              actionsContent(!hasBottomBar)}
          </div>
        </div>
      </MessageContainerSizeContext.Provider>
    );
  }
);

NewConversationUserMessage.displayName = "NewConversationUserMessage";

// --- Agent message ---

interface NewConversationAgentMessageProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  children?: React.ReactNode;
  citations?: React.ReactElement[];
  onDelete?: () => void;
  hideActions?: boolean;
  isLastMessage?: boolean;
}

export const NewConversationAgentMessage = React.forwardRef<
  HTMLDivElement,
  NewConversationAgentMessageProps
>(
  (
    {
      children,
      citations,
      className,
      onDelete,
      hideActions = false,
      isLastMessage = false,
      ...props
    },
    ref
  ) => {
    const shouldAutoCollapse = !isLastMessage && !hideActions;

    const {
      containerRef,
      contentRef,
      isExpanded,
      setIsExpanded,
      isCollapsible,
      expandedHeight,
      collapsedHeight,
    } = useCollapsibleContent({
      enabled: shouldAutoCollapse,
      deps: [children, citations],
    });

    const messageContainerSizeRef = React.useRef<HTMLDivElement>(null);
    const [messageContainerSize, setMessageContainerSize] =
      React.useState<MessageContainerSize>("default");

    React.useEffect(() => {
      const el = messageContainerSizeRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      const update = () => {
        setMessageContainerSize(
          el.clientWidth >= MESSAGE_CONTAINER_DEFAULT_MIN_WIDTH
            ? "default"
            : "compact"
        );
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    return (
      <MessageContainerSizeContext.Provider value={messageContainerSize}>
        <div
          ref={ref}
          className={cn(
            "s-group/new-conversation-message s-flex s-flex-col s-w-full s-items-start"
          )}
        >
          <div className="s-flex s-gap-1 s-w-full">
            <div
              ref={messageContainerSizeRef}
              className={cn(messageVariants({ type: "agent", className }))}
              {...props}
            >
              <div
                ref={containerRef}
                className={cn(
                  shouldAutoCollapse && isCollapsible && "s-relative"
                )}
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
                  <NewConversationMessageContent citations={citations}>
                    {children}
                  </NewConversationMessageContent>
                </div>
              </div>
            </div>
          </div>
          {((shouldAutoCollapse && isCollapsible) || !hideActions) && (
            <div className="s-relative s-flex s-items-center s-pt-2 s-gap-1 s-w-full s-px-3">
              {shouldAutoCollapse && isCollapsible && (
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    icon={isExpanded ? FullscreenExitIcon : FullscreenIcon}
                    label={isExpanded ? "Show less" : "Show all"}
                    onClick={() => setIsExpanded((value) => !value)}
                    aria-expanded={isExpanded}
                  />
                  <div
                    className={cn(
                      "s-pointer-events-none s-absolute s-bottom-full s-border-b s-border-border s-left-0 s-right-0 s-h-8 s-bg-gradient-to-b s-from-transparent s-transition-opacity",
                      isExpanded
                        ? "s-opacity-0"
                        : "s-to-background/80 dark:s-to-background-night/80 s-opacity-100"
                    )}
                  />
                </>
              )}
              {!hideActions && (
                <div className="s-flex s-items-center s-gap-1 s-opacity-0 s-transition-opacity group-hover/new-conversation-message:s-opacity-100">
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
                      <DropdownMenuItem
                        label="Copy anchor link"
                        icon={LinkIcon}
                      />
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
              )}
            </div>
          )}
        </div>
      </MessageContainerSizeContext.Provider>
    );
  }
);

NewConversationAgentMessage.displayName = "NewConversationAgentMessage";

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
>(({ children, citations, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-flex s-min-w-0 s-flex-1 s-flex-col s-gap-1 s-py-3",
        className
      )}
      {...props}
    >
      <div className="s-text-base s-text-foreground dark:s-text-foreground-night">
        {children}
      </div>
      {citations && citations.length > 0 && (
        <NewCitationGrid>{citations}</NewCitationGrid>
      )}
    </div>
  );
});

NewConversationMessageContent.displayName = "NewConversationMessageContent";
