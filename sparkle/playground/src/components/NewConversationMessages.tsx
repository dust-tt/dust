import {
  AnimatedText,
  Avatar,
  Button,
  ButtonGroup,
  ChevronRight,
  Clipboard,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Edit04,
  EmojiPicker,
  FaceSmile,
  Link01,
  Maximize01,
  Minimize01,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  ThumbsDown,
  ThumbsUp,
  Trash01,
  cn,
} from "@dust-tt/sparkle";
import type { EmojiMartData } from "@emoji-mart/data";
import emojiMartData from "@emoji-mart/data";
import { cva } from "class-variance-authority";
import React from "react";

import { NewCitationGrid } from "./NewCitation";

/** Width threshold: message container width >= this uses "default" size, below uses "compact". */
const MESSAGE_CONTAINER_DEFAULT_MIN_WIDTH = 500;

type MessageContainerSize = "compact" | "default";

const MessageContainerSizeContext =
  React.createContext<MessageContainerSize | null>(null);

/** Returns [ref, size] for use in message components: attach ref to the container div and wrap children with Provider. */
function useMessageContainerSizeProvider(): [
  React.RefObject<HTMLDivElement | null>,
  MessageContainerSize,
] {
  const messageContainerSizeRef = React.useRef<HTMLDivElement>(null);
  const [messageContainerSize, setMessageContainerSize] =
    React.useState<MessageContainerSize>("default");

  React.useEffect(() => {
    const el = messageContainerSizeRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
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

  return [messageContainerSizeRef, messageContainerSize];
}

function MessageContainerSizeContextProvider({
  value,
  children,
}: {
  value: MessageContainerSize;
  children: React.ReactNode;
}) {
  return (
    <MessageContainerSizeContext.Provider value={value}>
      {children}
    </MessageContainerSizeContext.Provider>
  );
}

// EmojiSkinType from emoji-mart; use a minimal type for the callback
type EmojiSkinType = { native: string };

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

const LOCUTOR_GROUP_CONTEXT: MessageGroupContextValue = {
  messageType: "locutor",
  messageContainerType: "locutor",
};

const AGENT_GROUP_CONTEXT: MessageGroupContextValue = {
  messageType: "agent",
  messageContainerType: "agent",
};

export const NewConversationContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col items-center @container/conversation",
        className
      )}
      {...props}
    >
      <div className="flex w-full max-w-4xl flex-col gap-4 px-4">
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
    <div ref={ref} className={cn(className)} {...props}>
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
      className={cn("flex items-center gap-2 pl-2", className)}
      {...props}
    >
      <Avatar {...resolvedAvatar} />
      <AnimatedText className="text-xs font-semibold">
        {resolvedName} is {action}
      </AnimatedText>
    </div>
  );
});

NewConversationActiveIndicator.displayName = "NewConversationActiveIndicator";

const messageGroupVariants = cva("flex w-full flex-col gap-1", {
  variants: {
    align: {
      start: "items-start",
      end: "items-end",
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
    const value = React.useMemo(
      () => ({ messageType, messageContainerType }),
      [messageType, messageContainerType]
    );

    return (
      <messageGroupTypeContext.Provider value={value}>
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
        className={cn("flex w-full items-center gap-2", className)}
        {...props}
      >
        {!isLocutor && <Avatar {...resolvedAvatar} />}
        <div
          className={cn(
            "inline-flex flex-1 items-center gap-0.5",
            isLocutor ? "justify-end" : "justify-between"
          )}
        >
          <div className="inline-flex items-baseline gap-2 text-foreground">
            <span className="heading-sm">
              {isLocutor ? "Me" : renderName(name)}
            </span>
            <span className="text-xs text-muted-foreground">{timestamp}</span>
            {infoChip && infoChip}
          </div>
          {completionStatus ? (
            <Button
              label={completionStatus as string}
              icon={ChevronRight}
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

const messageVariants = cva("flex max-w-full", {
  variants: {
    type: {
      interlocutor: "rounded-3xl bg-muted-background px-4 gap-2 w-fit",
      locutor: "rounded-3xl bg-muted-background px-4 gap-2 w-fit",
      agent: "flex-1 px-4",
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

    const [messageContainerSizeRef, messageContainerSize] =
      useMessageContainerSizeProvider();

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
    // @emoji-mart/data exports JSON directly; align it with EmojiPicker expected data shape.
    const emojiPickerData = emojiMartData as unknown as EmojiMartData;
    const emojiPickerTheme =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";

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
                icon={FaceSmile}
                aria-label="React with emoji"
              />
            </PopoverTrigger>
            <PopoverContent fullWidth>
              <EmojiPicker
                theme={emojiPickerTheme}
                previewPosition="none"
                data={emojiPickerData}
                onEmojiSelect={handleEmojiSelect ?? (() => undefined)}
              />
            </PopoverContent>
          </PopoverRoot>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                icon={DotsHorizontal}
                size="xs"
                variant="outline"
                aria-label="Message actions"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem label="Copy anchor link" icon={Link01} />
              <DropdownMenuSeparator />
              {canEdit && (
                <DropdownMenuItem
                  label="Edit"
                  icon={Edit04}
                  onClick={handleEditStart}
                />
              )}
              <DropdownMenuItem
                label="Delete"
                variant="warning"
                icon={Trash01}
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
            "flex gap-1 items-end opacity-0 transition-opacity",
            visible && "group-hover/new-conversation-message:opacity-100"
          )}
        >
          {actionsButtons}
        </div>
      ) : null;

    return (
      <MessageContainerSizeContextProvider value={messageContainerSize}>
        <div
          ref={ref}
          className={cn(
            "group/new-conversation-message flex flex-col w-full",
            resolvedType === "locutor" ? "items-end" : "items-start"
          )}
        >
          {citations && citations.length > 0 && (
            <NewCitationGrid
              className="pb-1 w-full"
              justify={resolvedType === "locutor" ? "end" : "start"}
            >
              {citations.map((c) =>
                React.cloneElement(c, { variant: "primary" })
              )}
            </NewCitationGrid>
          )}
          <div className={cn("flex gap-1", isEditing && "w-full")}>
            {resolvedType === "locutor" && actionsContent(!hasBottomBar)}
            <div className={cn("flex flex-col gap-1", isEditing && "w-full")}>
              <div
                ref={messageContainerSizeRef}
                className={cn(
                  messageVariants({ type: resolvedType, className }),
                  userCollapsible && "flex-col",
                  isEditing &&
                    "w-full mt-3 flex-col border border-highlight-300 ring-2 ring-highlight-300/50"
                )}
                {...props}
              >
                {isEditing ? (
                  <div className="py-3">
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
                      className="w-full resize-none bg-transparent text-base text-foreground outline-hidden border-none p-0 focus:outline-hidden focus:ring-0"
                      rows={1}
                    />
                  </div>
                ) : (
                  <div
                    ref={containerRef}
                    className={cn(
                      shouldAutoCollapse && isCollapsible && "relative"
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
                          "pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-linear-to-b from-transparent transition-opacity",
                          isExpanded
                            ? "opacity-0"
                            : "to-muted-background opacity-80"
                        )}
                      />
                    )}
                  </div>
                )}
              </div>
              {isEditing ? (
                <div className="flex justify-end gap-2 px-3 mb-3 mt-1">
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
                  <div className="flex flex-wrap items-center gap-1 px-3">
                    {userCollapsible && (
                      <Button
                        size="xs"
                        variant="outline"
                        icon={isExpanded ? Minimize01 : Maximize01}
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
      </MessageContainerSizeContextProvider>
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

    const [messageContainerSizeRef, messageContainerSize] =
      useMessageContainerSizeProvider();

    return (
      <MessageContainerSizeContextProvider value={messageContainerSize}>
        <div
          ref={ref}
          className={cn(
            "group/new-conversation-message flex flex-col w-full items-start"
          )}
        >
          <div className="flex gap-1 w-full">
            <div
              ref={messageContainerSizeRef}
              className={cn(messageVariants({ type: "agent", className }))}
              {...props}
            >
              <div
                ref={containerRef}
                className={cn(
                  shouldAutoCollapse && isCollapsible && "relative"
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
            <div className="relative flex items-center pt-2 gap-1 w-full px-3">
              {shouldAutoCollapse && isCollapsible && (
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    icon={isExpanded ? Minimize01 : Maximize01}
                    label={isExpanded ? "Show less" : "Show all"}
                    onClick={() => setIsExpanded((value) => !value)}
                    aria-expanded={isExpanded}
                  />
                  <div
                    className={cn(
                      isExpanded ? "opacity-0" : "to-background/80 opacity-100"
                    )}
                  />
                </>
              )}
              {!hideActions && (
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/new-conversation-message:opacity-100">
                  <ButtonGroup removeGaps>
                    <Button
                      icon={ThumbsUp}
                      size="xs"
                      variant="outline"
                      aria-label="Thumbs up"
                    />
                    <Button
                      icon={ThumbsDown}
                      size="xs"
                      variant="outline"
                      aria-label="Thumbs down"
                    />
                  </ButtonGroup>
                  <Button
                    icon={Clipboard}
                    size="xs"
                    variant="outline"
                    aria-label="Copy"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        icon={DotsHorizontal}
                        size="xs"
                        variant="outline"
                        aria-label="More actions"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        label="Copy anchor link"
                        icon={Link01}
                      />
                      <DropdownMenuSeparator />
                      <DropdownMenuItem label="Edit" icon={Edit04} />
                      <DropdownMenuItem
                        label="Delete"
                        variant="warning"
                        icon={Trash01}
                        onClick={onDelete}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          )}
        </div>
      </MessageContainerSizeContextProvider>
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
>(
  (
    {
      children,
      citations,
      className,
      reactions: _reactions,
      infoChip: _infoChip,
      onReactionClick: _onReactionClick,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn("flex min-w-0 flex-1 flex-col gap-1 py-3", className)}
        {...props}
      >
        <div className="text-base text-foreground">{children}</div>
        {citations && citations.length > 0 && (
          <NewCitationGrid>{citations}</NewCitationGrid>
        )}
      </div>
    );
  }
);

NewConversationMessageContent.displayName = "NewConversationMessageContent";

// --- Pending validation block (ephemeral container: user + agent + Accept/Cancel) ---

interface NewConversationPendingValidationBlockProps
  extends React.HTMLAttributes<HTMLDivElement> {
  userMessageContent: React.ReactNode;
  agentMessageContent: React.ReactNode;
  userGroupHeader: {
    timestamp?: string;
  };
  agentGroupHeader: {
    avatar?: React.ComponentProps<typeof Avatar>;
    name?: string;
    timestamp?: string;
    completionStatus?: React.ReactNode;
  };
  userCitations?: React.ReactElement[];
  agentCitations?: React.ReactElement[];
  onAccept: () => void;
  onCancel: () => void;
  hideActions?: boolean;
}

export const NewConversationPendingValidationBlock = React.forwardRef<
  HTMLDivElement,
  NewConversationPendingValidationBlockProps
>(
  (
    {
      userMessageContent,
      agentMessageContent,
      userGroupHeader,
      agentGroupHeader,
      userCitations,
      agentCitations,
      onAccept,
      onCancel,
      hideActions = false,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex relative w-full flex-col gap-3 pt-3 pb-2 border-t-2 border-highlight-100",
          className
        )}
        {...props}
      >
        <div className="flex w-full flex-col gap-1 pl-12">
          <messageGroupTypeContext.Provider value={LOCUTOR_GROUP_CONTEXT}>
            <NewConversationUserMessage
              hideActions
              isLastMessage
              citations={userCitations}
            >
              {userMessageContent}
            </NewConversationUserMessage>
          </messageGroupTypeContext.Provider>
        </div>
        <div className="flex w-full flex-col gap-1">
          <messageGroupTypeContext.Provider value={AGENT_GROUP_CONTEXT}>
            <NewConversationMessageGroupHeader
              groupType="agent"
              type="agent"
              avatar={agentGroupHeader.avatar}
              name={agentGroupHeader.name}
              timestamp={agentGroupHeader.timestamp}
              completionStatus={agentGroupHeader.completionStatus}
              renderName={(name) => <span>{name ?? ""}</span>}
            />
            <NewConversationAgentMessage
              hideActions
              isLastMessage
              citations={agentCitations}
            >
              {agentMessageContent}
            </NewConversationAgentMessage>
          </messageGroupTypeContext.Provider>
        </div>
        {!hideActions && (
          <div className="flex items-center gap-2 p-2 pl-3 rounded-b-2xl border-t-2 border border-highlight-100 bg-highlight-50">
            <span className="flex-1 text-sm text-foreground">
              This agent has access to sensitive data. Do you want to post this
              message in this shared conversation?
            </span>
            <Button
              size="sm"
              variant="outline"
              label="Cancel"
              onClick={onCancel}
            />
            <Button
              size="sm"
              variant="highlight"
              label="Accept"
              onClick={onAccept}
            />
          </div>
        )}
      </div>
    );
  }
);

NewConversationPendingValidationBlock.displayName =
  "NewConversationPendingValidationBlock";
