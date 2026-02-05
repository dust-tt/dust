import { cva } from "class-variance-authority";
import React from "react";

import {
  Avatar,
  Button,
  ButtonGroup,
  CitationGrid,
  DataEmojiMart,
  EmojiPicker,
  type EmojiMartData,
} from "@sparkle/components";
import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@sparkle/components/Popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import {
  ArrowRightIcon,
  ClipboardIcon,
  EmotionLaughIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  LinkIcon,
  MoreIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

type ConversationMessageType = "agent" | "locutor" | "interlocutor";
type MessageType = "agent" | "locutor" | "interlocutor";

type MessageGroupType = "agent" | "locutor" | "interlocutor";
type MessageGroupAlign = "start" | "end";

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
      <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-4">
        {children}
      </div>
    </div>
  );
});

NewConversationContainer.displayName = "NewConversationContainer";

const messageGroupVariants = cva("s-flex s-w-full s-flex-col s-gap-2", {
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
  avatarUrl?: string | React.ReactNode;
  isBusy?: boolean;
  isDisabled?: boolean;
  name?: string;
  timestamp?: string;
  infoChip?: React.ReactNode;
  completionStatus?: React.ReactNode;
  renderName?: (name: string | null) => React.ReactNode;
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
      avatarUrl,
      isBusy,
      isDisabled,
      name,
      timestamp,
      infoChip,
      completionStatus,
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
            avatarUrl={avatarUrl}
            name={name}
            isBusy={isBusy}
            isDisabled={isDisabled}
            type={messageType}
            timestamp={timestamp}
            infoChip={infoChip}
            completionStatus={completionStatus}
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
  avatarUrl?: string | React.ReactNode;
  isBusy?: boolean;
  isDisabled?: boolean;
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
      avatarUrl,
      isBusy,
      isDisabled,
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

    return (
      <div
        ref={ref}
        className={cn("s-flex s-w-full s-items-center s-gap-2", className)}
        {...props}
      >
        {!isLocutor && (
          <Avatar
            name={name}
            visual={avatarUrl}
            busy={isBusy}
            disabled={isDisabled}
            isRounded={type === "interlocutor"}
            size="sm"
          />
        )}
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
              icon={ArrowRightIcon}
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

const wrapperVariants = cva("s-flex s-gap-2", {
  variants: {
    messageType: {
      agent: "s-flex-col",
      locutor: "",
      interlocutor: "",
    },
  },
  defaultVariants: {
    messageType: "agent",
  },
});
const messageVariants = cva("s-flex s-max-w-full", {
  variants: {
    type: {
      interlocutor:
        "s-rounded-3xl s-bg-muted-background dark:s-bg-muted-background-night s-px-4 s-py-3 s-gap-2 s-w-fit s-rounded-tl-md",
      locutor:
        "s-rounded-3xl s-bg-muted-background dark:s-bg-muted-background-night s-px-4 s-py-3 s-gap-2 s-w-fit s-rounded-tr-md",
      agent: "s-flex-1 s-gap-3 s-px-4 @sm:s-flex-row s-flex-col",
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
  messageType?: MessageType;
  type?: ConversationMessageType;
}

export const NewConversationMessageContainer = React.forwardRef<
  HTMLDivElement,
  NewConversationMessageContainerProps
>(({ children, citations, className, messageType, type, ...props }, ref) => {
  const groupContext = React.useContext(messageGroupTypeContext);
  const resolvedMessageType = messageType ?? groupContext?.messageContainerType;
  const resolvedType = type ?? groupContext?.messageType;
  const actionsContent = (
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
          <DropdownMenuItem label="Delete" variant="warning" icon={TrashIcon} />
        </DropdownMenuContent>
      </DropdownMenu>
      <PopoverRoot>
        <PopoverTrigger asChild>
          <Button
            size="xs"
            variant="outline"
            icon={EmotionLaughIcon}
            aria-label="React with emoji"
            isSelect
          />
        </PopoverTrigger>
        <PopoverContent fullWidth>
          <EmojiPicker
            theme="light"
            previewPosition="none"
            data={DataEmojiMart as EmojiMartData}
            onEmojiSelect={() => undefined}
          />
        </PopoverContent>
      </PopoverRoot>
    </div>
  );

  const agentActionsContent = (
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
          <DropdownMenuItem label="Copy anchor link" />
          <DropdownMenuItem label="Delete" />
          <DropdownMenuItem label="Retry" />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div
      ref={ref}
      className={cn(
        "s-group/new-conversation-message",
        wrapperVariants({ messageType: resolvedMessageType })
      )}
    >
      {resolvedType === "locutor" && actionsContent}
      <div
        className={cn(messageVariants({ type: resolvedType, className }))}
        {...props}
      >
        <NewConversationMessageContent citations={citations}>
          {children}
        </NewConversationMessageContent>
      </div>
      {resolvedType === "interlocutor" && actionsContent}
      {resolvedType === "agent" && agentActionsContent}
    </div>
  );
});

NewConversationMessageContainer.displayName = "NewConversationMessageContainer";

interface NewConversationMessageContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  citations?: React.ReactElement[];
  type?: ConversationMessageType;
  infoChip?: React.ReactNode;
}

export const NewConversationMessageContent = React.forwardRef<
  HTMLDivElement,
  NewConversationMessageContentProps
>(({ children, citations, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("s-flex s-min-w-0 s-flex-col s-gap-1", className)}
      {...props}
    >
      <div className="s-text-base s-text-foreground dark:s-text-foreground-night">
        {children}
      </div>
      {citations && citations.length > 0 && (
        <CitationGrid>{citations}</CitationGrid>
      )}
    </div>
  );
});

NewConversationMessageContent.displayName = "NewConversationMessageContent";
