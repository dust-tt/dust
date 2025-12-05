import {
  BoltIcon,
  Button,
  classNames,
  ConversationMessage,
  Icon,
  Markdown,
  PencilSquareIcon,
  Tooltip,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import { useCallback, useContext, useMemo, useState } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import { DeletedMessage } from "@app/components/assistant/conversation/DeletedMessage";
import { Toolbar } from "@app/components/assistant/conversation/input_bar/toolbar/Toolbar";
import { NewConversationMessage } from "@app/components/assistant/conversation/NewConversationMessage";
import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import {
  hasHumansInteracting,
  isTriggeredOrigin,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { ConfirmContext } from "@app/components/Confirm";
import type { EditorService } from "@app/components/editor/input_bar/useCustomEditor";
import useCustomEditor from "@app/components/editor/input_bar/useCustomEditor";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import {
  ContentNodeMentionBlock,
  contentNodeMentionDirective,
} from "@app/components/markdown/ContentNodeMentionBlock";
import {
  PastedAttachmentBlock,
  pastedAttachmentDirective,
} from "@app/components/markdown/PastedAttachmentBlock";
import { useDeleteMessage } from "@app/hooks/useDeleteMessage";
import {
  agentMentionDirective,
  getAgentMentionPlugin,
  getUserMentionPlugin,
  userMentionDirective,
} from "@app/lib/mentions/markdown/plugin";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { formatTimestring } from "@app/lib/utils/timestamps";
import type { UserMessageType, WorkspaceType } from "@app/types";

// TODO (yuka:2025-12-04): we should show editing UI when the message is editable
const showEditing = false;

interface UserMessageEditorProps {
  editor: Editor | null;
  editorService: EditorService;
  setIsEditing: (isEditing: boolean) => void;
}

function UserMessageEditor({
  editor,
  editorService,
  setIsEditing,
}: UserMessageEditorProps) {
  if (!editor) {
    return null;
  }

  return (
    <div
      className="dark:focus-within:ring-highlight/30-night w-full rounded-2xl bg-muted-background py-2 pl-4 pr-2 focus-within:ring-1 focus-within:ring-highlight/30 dark:bg-muted-background-night dark:ring-border-dark-night dark:focus-within:ring-1 sm:focus-within:ring-2 dark:sm:focus-within:ring-2"
      onClick={(e) => {
        // If e.target is not a child of a div with class "tiptap", then focus on the editor
        if (!(e.target instanceof HTMLElement && e.target.closest(".tiptap"))) {
          editorService.focusEnd();
        }
      }}
    >
      <EditorContent
        editor={editor}
        className={`inline-block max-h-[40vh] min-h-14 w-full overflow-y-auto whitespace-pre-wrap scrollbar-hide`}
      />

      <BubbleMenu editor={editor} className="hidden sm:flex">
        <Toolbar editor={editor} className="hidden sm:inline-flex" />
      </BubbleMenu>

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost-secondary"
          size="xs"
          onClick={() => setIsEditing(false)}
          label="Cancel"
        />
        <Button
          variant="highlight"
          size="xs"
          onClick={() => setIsEditing(false)}
          label="Save"
        />
      </div>
    </div>
  );
}

interface UserMessageContentProps {
  message: UserMessageType;
  isDeleted: boolean;
  isLastMessage: boolean;
  additionalMarkdownComponents: Components;
  additionalMarkdownPlugins: PluggableList;
}

function UserMessageContent({
  message,
  isDeleted,
  isLastMessage,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
}: UserMessageContentProps) {
  if (isDeleted) {
    return <DeletedMessage />;
  }

  return (
    <Markdown
      content={message.content}
      isStreaming={false}
      isLastMessage={isLastMessage}
      additionalMarkdownComponents={additionalMarkdownComponents}
      additionalMarkdownPlugins={additionalMarkdownPlugins}
    />
  );
}

interface UserMessageProps {
  citations?: React.ReactElement[];
  conversationId: string;
  currentUserId: string;
  isLastMessage: boolean;
  message: UserMessageType;
  owner: WorkspaceType;
}

export function UserMessage({
  citations,
  conversationId,
  currentUserId,
  isLastMessage,
  message,
  owner,
}: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const userMentionsEnabled = hasFeature("mentions_v2");
  const isAdmin = owner.role === "admin";
  const { deleteMessage, isDeleting } = useDeleteMessage({
    owner,
    conversationId,
  });
  const confirm = useContext(ConfirmContext);
  const { editor, editorService } = useCustomEditor({
    owner,
    conversationId,
    // TODO (yuka:2025-12-04): we should fire save edit event here
    onEnterKeyDown: () => {},
    disableAutoFocus: false,
  });

  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      mention: getAgentMentionPlugin(owner),
      mention_user: getUserMentionPlugin(owner),
      content_node_mention: ContentNodeMentionBlock,
      pasted_attachment: PastedAttachmentBlock,
    }),
    [owner]
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [
      getCiteDirective(),
      agentMentionDirective,
      userMentionDirective,
      contentNodeMentionDirective,
      pastedAttachmentDirective,
    ],
    []
  );

  const renderName = useCallback((name: string | null) => {
    return <div>{name}</div>;
  }, []);

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
  const canDelete =
    (isCurrentUser || isAdmin) && !isDeleted && userMentionsEnabled;
  const canEdit =
    isCurrentUser && !isDeleted && showEditing && userMentionsEnabled;

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
    setIsEditing(true);
    editorService.setContent(message.content);
  };

  const showActions = !isDeleted && !isEditing;
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

  if (userMentionsEnabled) {
    return (
      <div className="flex flex-grow flex-col">
        <div
          className={classNames(
            "flex w-full min-w-60 flex-col",
            isCurrentUser ? "items-end" : "items-start"
          )}
        >
          {isEditing ? (
            <UserMessageEditor
              editor={editor}
              editorService={editorService}
              setIsEditing={setIsEditing}
            />
          ) : (
            <NewConversationMessage
              pictureUrl={
                message.context.profilePictureUrl ?? message.user?.image
              }
              name={message.context.fullName ?? undefined}
              renderName={renderName}
              timestamp={formatTimestring(message.created)}
              infoChip={
                isTriggeredOrigin(message.context.origin) && (
                  <span className="translate-y-1 text-muted-foreground dark:text-muted-foreground-night">
                    <TriggerChip message={message} />
                  </span>
                )
              }
              type="user"
              isCurrentUser={isCurrentUser}
              citations={citations}
              actions={actions}
            >
              <UserMessageContent
                message={message}
                isDeleted={isDeleted}
                isLastMessage={isLastMessage}
                additionalMarkdownComponents={additionalMarkdownComponents}
                additionalMarkdownPlugins={additionalMarkdownPlugins}
              />
            </NewConversationMessage>
          )}
        </div>
        {showAgentSuggestions && (
          <AgentSuggestion
            conversationId={conversationId}
            owner={owner}
            userMessage={message}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-grow flex-col">
      <div className="min-w-60 max-w-full self-end">
        <ConversationMessage
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          pictureUrl={message.context.profilePictureUrl || message.user?.image}
          name={message.context.fullName ?? undefined}
          renderName={renderName}
          timestamp={formatTimestring(message.created)}
          infoChip={
            isTriggeredOrigin(message.context.origin) && (
              <span className="translate-y-1 text-muted-foreground dark:text-muted-foreground-night">
                <TriggerChip message={message} />
              </span>
            )
          }
          type="user"
          citations={citations}
          actions={actions}
        >
          {isDeleted ? (
            <DeletedMessage />
          ) : (
            <Markdown
              content={message.content}
              isStreaming={false}
              isLastMessage={isLastMessage}
              additionalMarkdownComponents={additionalMarkdownComponents}
              additionalMarkdownPlugins={additionalMarkdownPlugins}
            />
          )}
        </ConversationMessage>
      </div>
      {showAgentSuggestions && (
        <AgentSuggestion
          conversationId={conversationId}
          owner={owner}
          userMessage={message}
        />
      )}
    </div>
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
