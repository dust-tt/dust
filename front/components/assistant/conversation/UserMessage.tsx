import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import { DeletedMessage } from "@app/components/assistant/conversation/DeletedMessage";
import { ToolBarContent } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarContent";
import { MessageEmojiPicker } from "@app/components/assistant/conversation/MessageEmojiPicker";
import { MessageReactions } from "@app/components/assistant/conversation/MessageReactions";
import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import {
  hasHumansInteracting,
  isTriggeredOrigin,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { UserHandle } from "@app/components/assistant/conversation/UserHandle";
import { UserMessageMarkdown } from "@app/components/assistant/UserMessageMarkdown";
import { ConfirmContext } from "@app/components/Confirm";
import type { EditorService } from "@app/components/editor/input_bar/useCustomEditor";
import useCustomEditor from "@app/components/editor/input_bar/useCustomEditor";
import { useDeleteMessage } from "@app/hooks/useDeleteMessage";
import { useEditUserMessage } from "@app/hooks/useEditUserMessage";
import { useHover } from "@app/hooks/useHover";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { getConversationRoute } from "@app/lib/utils/router";
import { formatTimestring } from "@app/lib/utils/timestamps";
import type {
  UserMessageType,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import {
  BoltIcon,
  Button,
  ConversationMessageAvatar,
  ConversationMessageContainer,
  ConversationMessageContent,
  ConversationMessageTitle,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  LinkIcon,
  MoreIcon,
  PencilSquareIcon,
  Toolbar,
  Tooltip,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import { cva } from "class-variance-authority";
import type React from "react";
import { useCallback, useContext, useMemo, useState } from "react";

interface UserMessageEditorProps {
  editor: Editor | null;
  editorService: EditorService;
  setShouldShowEditor: (shouldShowEditor: boolean) => void;
  isSaving: boolean;
  onSave: () => void;
}

function UserMessageEditor({
  editor,
  editorService,
  setShouldShowEditor,
  isSaving,
  onSave,
}: UserMessageEditorProps) {
  const isMobile = useIsMobile();

  if (!editor) {
    return null;
  }

  return (
    <div
      className="dark:focus-within:ring-highlight/30-night w-full rounded-2xl bg-muted-background py-3 pl-4 pr-3 focus-within:ring-1 focus-within:ring-highlight/30 dark:bg-muted-background-night dark:ring-border-dark-night dark:focus-within:ring-1 sm:focus-within:ring-2 dark:sm:focus-within:ring-2"
      onClick={(e) => {
        // If e.target is not a child of a div with class "tiptap", then focus on the editor
        if (!(e.target instanceof HTMLElement && e.target.closest(".tiptap"))) {
          editorService.focusEnd();
        }
      }}
    >
      <EditorContent
        editor={editor}
        disabled={isSaving}
        className="inline-block max-h-[40vh] min-h-14 w-full overflow-y-auto whitespace-pre-wrap scrollbar-hide"
      />

      <BubbleMenu editor={editor} className={cn("flex", isMobile && "hidden")}>
        {editor && (
          <Toolbar className={cn("inline-flex", isMobile && "hidden")}>
            <ToolBarContent editor={editor} />
          </Toolbar>
        )}
      </BubbleMenu>

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost-secondary"
          size="xs"
          onClick={() => setShouldShowEditor(false)}
          label="Cancel"
        />
        <Button
          variant="highlight"
          size="xs"
          onClick={onSave}
          label="Save"
          isLoading={isSaving}
        />
      </div>
    </div>
  );
}

interface UserMessageProps {
  citations?: React.ReactElement[];
  conversationId: string;
  currentUserId: string;
  isLastMessage: boolean;
  message: UserMessageTypeWithContentFragments;
  owner: WorkspaceType;
  onReactionToggle: (emoji: string) => void;
}

export function UserMessage({
  citations,
  conversationId,
  currentUserId,
  isLastMessage,
  message,
  owner,
  onReactionToggle,
}: UserMessageProps) {
  const [shouldShowEditor, setShouldShowEditor] = useState(false);
  const { ref: userMessageHoveredRef, isHovering: isUserMessageHovered } =
    useHover();
  const isAdmin = owner.role === "admin";
  const { deleteMessage, isDeleting } = useDeleteMessage({
    owner,
    conversationId,
  });
  const { editMessage, isEditing: isSaving } = useEditUserMessage({
    owner,
    conversationId,
  });
  const confirm = useContext(ConfirmContext);

  const handleSave = async () => {
    const { markdown, mentions } = editorService.getMarkdownAndMentions();

    await editMessage({
      messageId: message.sId,
      content: markdown,
      mentions,
    });

    setShouldShowEditor(false);
  };

  const { editor, editorService } = useCustomEditor({
    owner,
    conversationId,
    onEnterKeyDown: handleSave,
    disableAutoFocus: false,
  });

  const renderName = useCallback(
    (name: string | null) => {
      if (!message.user) {
        return <div>{name}</div>;
      }
      return (
        <UserHandle
          user={{
            sId: message.user.sId,
            name: message.user.fullName,
          }}
        />
      );
    },
    [message.user]
  );

  const methods = useVirtuosoMethods<VirtuosoMessage>();

  const showAgentSuggestions = useMemo(() => {
    return (
      message.mentions.length === 0 &&
      isLastMessage &&
      !hasHumansInteracting(methods.data.get()) &&
      message.user?.sId === currentUserId
    );
  }, [
    message.mentions.length,
    message.user?.sId,
    isLastMessage,
    methods.data,
    currentUserId,
  ]);

  const isDeleted = message.visibility === "deleted";
  const isCurrentUser = message.user?.sId === currentUserId;
  const canDelete = (isCurrentUser || isAdmin) && !isDeleted;
  const canEdit = isCurrentUser && !isDeleted;

  const handleDeleteMessage = useCallback(async () => {
    if (isDeleting || isDeleted) {
      return;
    }

    const confirmed = await confirm({
      title: isCurrentUser ? "Delete your message" : "Delete user message",
      message: isCurrentUser
        ? "Are you sure you want to delete this message? This action cannot be undone."
        : "Are you sure you want to delete this user's message? This the message will be deleted for all participants.",
      validateLabel: "Delete",
      validateVariant: "warning",
    });

    if (confirmed) {
      await deleteMessage(message.sId);
      // Optimistically update the message visibility in the Virtuoso list
      methods.data.map((m) => {
        if (isUserMessage(m) && m.sId === message.sId) {
          return {
            ...m,
            visibility: "deleted",
          };
        }
        return m;
      });
    }
  }, [
    isDeleting,
    isDeleted,
    confirm,
    deleteMessage,
    isCurrentUser,
    message.sId,
    methods,
  ]);

  const handleEditMessage = () => {
    setShouldShowEditor(true);
    editorService.setContent(message.content);
  };

  const isMobile = useIsMobile();
  const showActions = !isDeleted && !shouldShowEditor;
  const hasReactions = (message.reactions ?? []).length > 0;
  // On mobile or when there are reactions, show the action menu below the message.
  // Otherwise, show it to the side of the message.
  const showBottomActionMenu = !isDeleted && (hasReactions || isMobile);
  const showSideActionMenu = !isDeleted && !hasReactions && !isMobile;
  // With reactions the button is always below; without, CSS container query floats it to the side.
  // Deleted messages have no action menu → tight spacing.
  const actionMenuBottomMargin = isDeleted
    ? "mb-1"
    : hasReactions
      ? "mb-8"
      : "mb-8 @sm/conversation:mb-1";

  const displayChip =
    message.version > 0 || isTriggeredOrigin(message.context.origin);
  const pictureUrl = message.context.profilePictureUrl ?? message.user?.image;
  const timestamp = formatTimestring(message.created);
  const name = message.context.fullName ?? undefined;

  // When there are multiple citations, we want to show the message bigger even if the message itself is short
  const shouldShowBiggerUserMessage = citations && citations.length > 2;

  return (
    <>
      {shouldShowEditor ? (
        <UserMessageEditor
          editor={editor}
          editorService={editorService}
          setShouldShowEditor={setShouldShowEditor}
          onSave={handleSave}
          isSaving={isSaving}
        />
      ) : (
        <div className="text-right">
          <div className="inline-flex items-center justify-between gap-0.5">
            <ConversationMessageTitle
              name={isCurrentUser ? undefined : name}
              timestamp={timestamp}
              infoChip={
                displayChip ? (
                  <>
                    {isTriggeredOrigin(message.context.origin) && (
                      <span className="inline-block leading-none text-muted-foreground dark:text-muted-foreground-night">
                        <TriggerChip message={message} />
                      </span>
                    )}
                    {message.version > 0 && !isDeleted && (
                      <span className="text-xs text-faint dark:text-muted-foreground-night">
                        (edited)
                      </span>
                    )}
                  </>
                ) : undefined
              }
              renderName={isCurrentUser ? () => null : renderName}
            />
          </div>
          <ConversationMessageContainer
            messageType={isCurrentUser ? "me" : "user"}
            type="user"
            className={cn(
              isCurrentUser ? "ml-auto" : undefined,
              "relative min-w-56 max-w-3xl @xxxs/conversation:max-w-[95%] @xxs/conversation:max-w-[80%] @xs/conversation:max-w-[85%]",
              actionMenuBottomMargin
            )}
            ref={userMessageHoveredRef}
          >
            {!isCurrentUser && (
              <ConversationMessageAvatar
                className="flex"
                avatarUrl={pictureUrl}
                name={name}
                type="user"
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <ConversationMessageContent
                citations={citations}
                type="user"
                className={cn(shouldShowBiggerUserMessage && "@sm:min-w-100")}
              >
                {isDeleted ? (
                  <DeletedMessage />
                ) : (
                  <UserMessageMarkdown
                    owner={owner}
                    message={message}
                    isLastMessage={isLastMessage}
                  />
                )}
              </ConversationMessageContent>
              {showBottomActionMenu && (
                <ActionMenu
                  mode="bottom"
                  isCurrentUser={isCurrentUser}
                  isDeleted={isDeleted}
                  showActions={showActions}
                  isUserMessageHovered={isUserMessageHovered}
                  message={message}
                  onReactionToggle={onReactionToggle}
                  handleEditMessage={handleEditMessage}
                  handleDeleteMessage={handleDeleteMessage}
                  canDelete={canDelete}
                  canEdit={canEdit}
                  conversationId={conversationId}
                  owner={owner}
                />
              )}
            </div>
            {showSideActionMenu && (
              <ActionMenu
                mode="side"
                isCurrentUser={isCurrentUser}
                isDeleted={isDeleted}
                showActions={showActions}
                isUserMessageHovered={isUserMessageHovered}
                message={message}
                onReactionToggle={onReactionToggle}
                handleEditMessage={handleEditMessage}
                handleDeleteMessage={handleDeleteMessage}
                canDelete={canDelete}
                canEdit={canEdit}
                conversationId={conversationId}
                owner={owner}
              />
            )}
          </ConversationMessageContainer>
        </div>
      )}

      {showAgentSuggestions && (
        <AgentSuggestion
          conversationId={conversationId}
          owner={owner}
          userMessage={message}
        />
      )}
    </>
  );
}

function getChipDateFormat(date: Date) {
  return date.toLocaleDateString("en-EN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Label({ message }: { message?: UserMessageType }) {
  if (message?.context.lastTriggerRunAt) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-bold">Scheduled and sent automatically</span>
        {message?.created && (
          <span>
            <span className="font-semibold">Current execution</span>:{" "}
            {getChipDateFormat(new Date(message?.created))}
          </span>
        )}
        {message?.context.lastTriggerRunAt && (
          <span>
            <span className="font-semibold">Previous run</span>:{" "}
            {getChipDateFormat(new Date(message?.context.lastTriggerRunAt))}
          </span>
        )}
      </div>
    );
  } else {
    return <span className="font-bold">Triggered and sent automatically</span>;
  }
}

function TriggerChip({ message }: { message?: UserMessageType }) {
  return (
    <Tooltip
      label={<Label message={message} />}
      trigger={<Icon size="xs" visual={BoltIcon} />}
    />
  );
}

// When the conversation container is narrow, the action menu sits below the message bubble.
// When the conversation container is wider, it floats to the left (current user) or right (other user).
const actionMenuContainerVariants = cva(
  "flex items-center gap-1 absolute left-0 bottom-0",
  {
    variants: {
      mode: {
        side: "",
        bottom: "translate-y-[calc(100%+2px)]",
      },
      isCurrentUser: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        mode: "side",
        isCurrentUser: true,
        className: "-translate-x-full pr-2",
      },
      {
        mode: "side",
        isCurrentUser: false,
        className: "left-auto right-0 translate-x-full pl-2",
      },
    ],
  }
);

interface ActionMenuProps {
  mode: "side" | "bottom";
  isCurrentUser: boolean;
  isDeleted: boolean;
  showActions: boolean;
  canEdit: boolean;
  canDelete: boolean;
  handleEditMessage: () => void;
  handleDeleteMessage: () => void;
  message: UserMessageTypeWithContentFragments;
  onReactionToggle: (emoji: string) => void;
  isUserMessageHovered: boolean;
  conversationId: string;
  owner: WorkspaceType;
}

function ActionMenu({
  mode,
  isCurrentUser,
  isDeleted,
  showActions,
  canEdit,
  canDelete,
  handleEditMessage,
  handleDeleteMessage,
  message,
  onReactionToggle,
  isUserMessageHovered,
  conversationId,
  owner,
}: ActionMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const sendNotification = useSendNotification();
  const { ref: isReactionsHoveredRef, isHovering: isReactionsHovered } =
    useHover();
  // In bottom mode (reactions or mobile), buttons are always visible.
  // In side mode, buttons fade in/out on hover.
  const shouldHideActions =
    mode === "side" &&
    !isUserMessageHovered &&
    !isReactionsHovered &&
    !isMenuOpen;

  const handleCopyMessageLink = () => {
    const messageUrl = `${getConversationRoute(
      owner.sId,
      conversationId,
      undefined,
      config.getAppUrl()
    )}#${message.sId}`;
    void navigator.clipboard.writeText(messageUrl);
    sendNotification({
      type: "success",
      title: "Message link copied to clipboard",
    });
  };

  const actions = showActions
    ? [
        {
          icon: LinkIcon,
          label: "Copy message link",
          onClick: handleCopyMessageLink,
        },
        ...(canEdit
          ? [
              {
                icon: PencilSquareIcon,
                label: "Edit message",
                onClick: handleEditMessage,
              },
            ]
          : []),
        ...(canDelete
          ? [
              {
                icon: TrashIcon,
                label: "Delete message",
                onClick: handleDeleteMessage,
              },
            ]
          : []),
      ]
    : [];

  // In a wide conversation container, side mode buttons float beside the bubble — fade in/out on hover.
  // In a narrow container (and in bottom mode), buttons sit below the bubble — always visible.
  const sideItemVisibilityClass = cn(
    "transition-opacity duration-300",
    mode === "side" && shouldHideActions && "@sm/conversation:opacity-0"
  );

  return (
    <div
      className={actionMenuContainerVariants({ mode, isCurrentUser })}
      ref={isReactionsHoveredRef}
    >
      {mode === "bottom" && (
        <MessageReactions
          reactions={message.reactions ?? []}
          onReactionClick={onReactionToggle}
        />
      )}
      {!isDeleted && (
        <div className={cn("flex items-center gap-1", sideItemVisibilityClass)}>
          <MessageEmojiPicker
            key="emoji-picker"
            onEmojiSelect={onReactionToggle}
          />
          {actions.length > 0 && (
            <DropdownMenu
              open={isMenuOpen}
              onOpenChange={(open) => setIsMenuOpen(open)}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  icon={MoreIcon}
                  size="icon-xs"
                  variant="outline"
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
      )}
    </div>
  );
}
