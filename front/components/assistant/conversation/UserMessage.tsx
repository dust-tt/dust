import {
  BoltIcon,
  Button,
  cn,
  ConversationMessageAvatar,
  ConversationMessageContainer,
  ConversationMessageContent,
  ConversationMessageTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  MoreIcon,
  PencilSquareIcon,
  Tooltip,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import React, { useCallback, useContext, useMemo, useState } from "react";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import { DeletedMessage } from "@app/components/assistant/conversation/DeletedMessage";
import { Toolbar } from "@app/components/assistant/conversation/input_bar/toolbar/Toolbar";
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
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { formatTimestring } from "@app/lib/utils/timestamps";
import type {
  UserMessageType,
  UserMessageTypeWithContentFragments,
  WorkspaceType,
} from "@app/types";

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

      <BubbleMenu editor={editor} className="hidden sm:flex">
        <Toolbar editor={editor} className="hidden sm:inline-flex" />
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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

  const featureFlags = useFeatureFlags({ workspaceId: owner.sId });
  const reactionsEnabled = featureFlags.hasFeature("reactions");

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
      !hasHumansInteracting(methods.data.get())
    );
  }, [message.mentions.length, isLastMessage, methods.data]);

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

  const showActions = !isDeleted && !shouldShowEditor;
  const actions = showActions
    ? [
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
        <ConversationMessageContainer
          messageType={isCurrentUser ? "me" : "user"}
          type="user"
          className={isCurrentUser ? "ml-auto" : undefined}
          ref={userMessageHoveredRef}
        >
          <ConversationMessageAvatar
            className="flex"
            avatarUrl={pictureUrl}
            name={name}
            type="user"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="inline-flex items-center justify-between gap-0.5">
              <ConversationMessageTitle
                name={name}
                timestamp={timestamp}
                infoChip={
                  displayChip ? (
                    <>
                      {isTriggeredOrigin(message.context.origin) && (
                        <span className="inline-block leading-none text-muted-foreground dark:text-muted-foreground-night">
                          <TriggerChip message={message} />
                        </span>
                      )}
                      {message.version > 0 && (
                        <span className="text-xs text-faint dark:text-muted-foreground-night">
                          (edited)
                        </span>
                      )}
                    </>
                  ) : undefined
                }
                renderName={renderName}
              />
              {actions && actions.length > 0 && (
                <DropdownMenu
                  open={isMenuOpen}
                  onOpenChange={(open) => setIsMenuOpen(open)}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      icon={MoreIcon}
                      size="xs"
                      variant="ghost-secondary"
                      aria-label="Message actions"
                      className={cn(
                        "opacity-100 transition-opacity duration-200",
                        !isUserMessageHovered && !isMenuOpen && "sm:opacity-0" // always show on small screens
                      )}
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
              {!isDeleted && reactionsEnabled && (
                <>
                  <MessageEmojiPicker
                    key="emoji-picker"
                    onEmojiSelect={onReactionToggle}
                  />
                  <MessageReactions
                    reactions={message.reactions ?? []}
                    onReactionClick={onReactionToggle}
                  />
                </>
              )}
            </ConversationMessageContent>
          </div>
        </ConversationMessageContainer>
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
