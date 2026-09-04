import {
  ActionCardBlock,
  ActionFrame,
  Download01,
  ArrowRight,
  AttachmentChip,
  Attachment01,
  Avatar,
  Zap,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Check,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  File02,
  LinkExternal01,
  Icon,
  Image01,
  ImageZoomDialog,
  Input,
  Markdown,
  DotsHorizontal,
  NotionLogo,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SlackLogo,
  Table,
} from "@dust-tt/sparkle";
import { ActionCardState, BreadcrumbsItem } from "@dust-tt/sparkle";
import {
  NewConversationActiveIndicator,
  NewConversationAgentMessage,
  NewConversationContainer,
  NewConversationMessageGroup,
  NewConversationPendingValidationBlock,
  NewConversationSectionHeading,
  NewConversationUserMessage,
} from "./NewConversationMessages";
import { NewCitation } from "./NewCitation";
import type { Components } from "react-markdown";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  FileChip,
  FileInsertProvider,
  type FileInsertTarget,
  type FileInsertType,
} from "./InlineFileChip";
import { fileChipDirective } from "./fileChipDirective";

import { getAgentById } from "../data/agents";
import type {
  Agent,
  Conversation,
  ConversationItem,
  ConversationMessage,
  ConversationPendingValidation,
  MessageCitationData,
  MessageGroupData,
  MessageGroupType,
  MessageReactionData,
  User,
} from "../data/types";
import { getUserById } from "../data/users";
import { InputBar } from "./InputBar";
import { SuggestionBox } from "./SuggestionBox";

// Map an inline file insert type onto the citation icon vocabulary so file
// chips reuse the same preview sheet as citations.
function fileInsertTypeToCitationIcon(
  fileType: FileInsertType
): MessageCitationData["icon"] {
  switch (fileType) {
    case "xlsx":
    case "csv":
      return "table";
    case "image":
      return "image";
    case "slack":
      return "slack";
    case "notion":
      return "notion";
    default:
      return "document";
  }
}

interface ConversationViewProps {
  conversation: Conversation;
  locutor: User; // Current user (Locutor)
  users: User[];
  agents: Agent[];
  conversationsWithMessages: Conversation[]; // Conversations that have messages to randomly select from
  conversationTitle?: string;
  onAcceptPendingValidation?: (blockId: string) => void;
  onCancelPendingValidation?: (blockId: string) => void;
  validationDisplayMode?: "inline" | "sheet";
  /** When validationDisplayMode is "sheet", called when user clicks Send. Use to open the validation sheet. */
  onSend?: () => void;
  /** When validationDisplayMode is "sheet", the validation content to show in the sheet (e.g. when user clicked Send). */
  pendingValidationForSheet?: ConversationPendingValidation | null;
  /** When set, citation clicks call this instead of opening the internal sheet. */
  onCitationOpen?: (citation: { title: string; icon?: string }) => void;
}

export function ConversationView({
  conversation,
  locutor,
  users,
  agents,
  conversationsWithMessages,
  conversationTitle,
  onAcceptPendingValidation,
  onCancelPendingValidation,
  validationDisplayMode = "inline",
  onSend,
  pendingValidationForSheet,
  onCitationOpen,
}: ConversationViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [pendingTitle, setPendingTitle] = useState("");
  const [displayTitle, setDisplayTitle] = useState(
    conversationTitle || conversation.title || "Conversation"
  );
  const [isCitationSheetOpen, setIsCitationSheetOpen] = useState(false);
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] =
    useState<MessageCitationData | null>(null);
  const [documentView, setDocumentView] = useState<"preview" | "extracted">(
    "preview"
  );

  useEffect(() => {
    const nextTitle = conversationTitle || conversation.title || "Conversation";
    setDisplayTitle(nextTitle);
    if (!isRenameDialogOpen) {
      setPendingTitle(nextTitle);
    }
  }, [
    conversation.id,
    conversation.title,
    conversationTitle,
    isRenameDialogOpen,
  ]);

  const getUserByOwnerId = (id: string): User | undefined =>
    getUserById(id) || users.find((user) => user.id === id);

  const getAgentByOwnerId = (id: string): Agent | undefined =>
    getAgentById(id) || agents.find((agent) => agent.id === id);

  const itemsToDisplay: ConversationItem[] = useMemo(() => {
    if (conversation.messages && conversation.messages.length > 0) {
      return conversation.messages;
    }

    if (conversationsWithMessages.length === 0) {
      return [];
    }

    const randomIndex = Math.floor(
      Math.random() * conversationsWithMessages.length
    );
    const sourceConversation = conversationsWithMessages[randomIndex];
    const sourceItems = sourceConversation.messages || [];

    if (sourceItems.length === 0) {
      return [];
    }

    const currentUserParticipants = conversation.userParticipants;
    const currentAgentParticipants = conversation.agentParticipants;

    let userMessageCount = 0;
    let agentMessageCount = 0;
    const otherUsers = currentUserParticipants.filter(
      (id) => id !== locutor.id
    );

    const getMappedUserId = () => {
      if (userMessageCount === 0 || userMessageCount % 2 === 0) {
        return locutor.id;
      }
      if (otherUsers.length > 0) {
        const mappedIndex =
          Math.floor((userMessageCount - 1) / 2) % otherUsers.length;
        return otherUsers[mappedIndex];
      }
      return locutor.id;
    };

    const getMappedAgentId = (fallbackId: string) => {
      if (currentAgentParticipants.length > 0) {
        const mappedIndex = agentMessageCount % currentAgentParticipants.length;
        return currentAgentParticipants[mappedIndex];
      }
      return fallbackId;
    };

    const resolveGroupType = (
      ownerType: ConversationMessage["ownerType"],
      ownerId: string
    ): MessageGroupType => {
      if (ownerType === "agent") {
        return "agent";
      }
      return ownerId === locutor.id ? "locutor" : "interlocutor";
    };

    const resolveGroupData = (
      message: ConversationMessage,
      ownerId: string,
      groupType: MessageGroupType
    ): MessageGroupData => {
      const owner =
        message.ownerType === "agent"
          ? getAgentByOwnerId(ownerId)
          : getUserByOwnerId(ownerId);
      const name =
        groupType === "locutor"
          ? undefined
          : owner && "name" in owner
            ? owner.name
            : owner && "fullName" in owner
              ? owner.fullName
              : message.group.name;

      const avatar =
        groupType === "agent"
          ? owner && "emoji" in owner
            ? { emoji: owner.emoji, backgroundColor: owner.backgroundColor }
            : message.group.avatar
          : groupType === "interlocutor"
            ? owner && "portrait" in owner
              ? { visual: owner.portrait, isRounded: true }
              : message.group.avatar
            : message.group.avatar;

      return {
        ...message.group,
        type: groupType,
        name,
        avatar,
      };
    };

    return sourceItems.map((item, index) => {
      if (item.kind !== "message") {
        if (item.kind === "activeIndicator") {
          if (item.type === "agent" && currentAgentParticipants.length > 0) {
            const agentId = currentAgentParticipants[0];
            const agent = getAgentByOwnerId(agentId);
            return {
              ...item,
              name: agent?.name ?? item.name,
              avatar: agent
                ? { emoji: agent.emoji, backgroundColor: agent.backgroundColor }
                : item.avatar,
            };
          }
          if (item.type === "interlocutor") {
            const userId = otherUsers[0] ?? locutor.id;
            const user = getUserByOwnerId(userId);
            return {
              ...item,
              name: user?.fullName ?? item.name,
              avatar: user?.portrait
                ? { visual: user.portrait, isRounded: true }
                : item.avatar,
            };
          }
        }
        return item;
      }

      let newOwnerId = item.ownerId;
      if (item.ownerType === "user") {
        newOwnerId = getMappedUserId();
        userMessageCount++;
      } else if (item.ownerType === "agent") {
        newOwnerId = getMappedAgentId(item.ownerId);
        agentMessageCount++;
      }

      const groupType = resolveGroupType(item.ownerType, newOwnerId);

      return {
        ...item,
        id: `${conversation.id}-msg-${index}`,
        ownerId: newOwnerId,
        group: resolveGroupData(item, newOwnerId, groupType),
      };
    });
  }, [
    conversation.agentParticipants,
    conversation.id,
    conversation.messages,
    conversation.userParticipants,
    conversationsWithMessages,
    locutor.id,
  ]);

  const baseReactionsById = useMemo(() => {
    const map = new Map<string, MessageReactionData[]>();
    itemsToDisplay.forEach((item) => {
      if (item.kind === "message" && item.reactions) {
        map.set(item.id, item.reactions);
      }
    });
    return map;
  }, [itemsToDisplay]);

  const lastMessageId = useMemo(() => {
    for (let index = itemsToDisplay.length - 1; index >= 0; index -= 1) {
      const item = itemsToDisplay[index];
      if (item.kind === "message") {
        return item.id;
      }
    }
    return null;
  }, [itemsToDisplay]);

  const [reactionOverrides, setReactionOverrides] = useState<
    Map<string, MessageReactionData[]>
  >(new Map());

  const [deletedMessages, setDeletedMessages] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    setReactionOverrides(new Map(baseReactionsById));
  }, [baseReactionsById, conversation.id]);

  useEffect(() => {
    setDeletedMessages(new Set());
  }, [conversation.id]);

  const baseActionStates = useMemo(() => {
    const map = new Map<string, ActionCardState>();
    itemsToDisplay.forEach((item) => {
      if (item.kind === "message" && item.actionCards) {
        item.actionCards.forEach((card) => {
          map.set(card.id, card.state ?? "active");
        });
      }
    });
    return map;
  }, [itemsToDisplay]);

  const [actionCardStates, setActionCardStates] = useState<
    Map<string, ActionCardState>
  >(new Map());
  const [taskSuggestionTextById, setTaskSuggestionTextById] = useState<
    Record<string, string>
  >({});
  const [hiddenTaskSuggestionBoxIds, setHiddenTaskSuggestionBoxIds] = useState<
    Set<string>
  >(new Set());
  const [hiddenTaskSuggestionItemIds, setHiddenTaskSuggestionItemIds] =
    useState<Set<string>>(new Set());

  useEffect(() => {
    setActionCardStates(new Map(baseActionStates));
  }, [baseActionStates, conversation.id]);

  useEffect(() => {
    setTaskSuggestionTextById({});
    setHiddenTaskSuggestionBoxIds(new Set());
    setHiddenTaskSuggestionItemIds(new Set());
  }, [conversation.id]);

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      setReactionOverrides((prev) => {
        const next = new Map(prev);
        const current = next.has(messageId)
          ? (next.get(messageId) ?? [])
          : (baseReactionsById.get(messageId) ?? []);
        const existingIndex = current.findIndex(
          (reaction) => reaction.emoji === emoji
        );
        let updated = [...current];

        if (existingIndex >= 0) {
          const existing = updated[existingIndex];
          if (existing.reactedByLocutor) {
            const nextCount = existing.count - 1;
            if (nextCount <= 0) {
              updated.splice(existingIndex, 1);
            } else {
              updated[existingIndex] = {
                ...existing,
                count: nextCount,
                reactedByLocutor: false,
              };
            }
          } else {
            updated[existingIndex] = {
              ...existing,
              count: existing.count + 1,
              reactedByLocutor: true,
            };
          }
        } else {
          updated = [...updated, { emoji, count: 1, reactedByLocutor: true }];
        }

        next.set(messageId, updated);
        return next;
      });
    },
    [baseReactionsById]
  );

  const markDeleted = useCallback((messageId: string) => {
    setDeletedMessages((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  }, []);

  const setActionCardState = useCallback(
    (cardId: string, nextState: ActionCardState) => {
      setActionCardStates((prev) => {
        const next = new Map(prev);
        next.set(cardId, nextState);
        return next;
      });
    },
    []
  );

  const setTaskSuggestionText = useCallback((id: string, text: string) => {
    setTaskSuggestionTextById((previousTextById) => ({
      ...previousTextById,
      [id]: text,
    }));
  }, []);

  const hideTaskSuggestionItem = useCallback((id: string) => {
    setHiddenTaskSuggestionItemIds((previousIds) => {
      const nextIds = new Set(previousIds);
      nextIds.add(id);
      return nextIds;
    });
  }, []);

  const hideTaskSuggestionBox = useCallback((id: string) => {
    setHiddenTaskSuggestionBoxIds((previousIds) => {
      const nextIds = new Set(previousIds);
      nextIds.add(id);
      return nextIds;
    });
  }, []);

  // Auto-scroll to bottom on mount and when conversation changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation.id, itemsToDisplay.length]);

  const breadcrumbItems: BreadcrumbsItem[] = [];

  breadcrumbItems.push({
    label: displayTitle,
    onClick: () => {
      setPendingTitle(displayTitle);
      setIsRenameDialogOpen(true);
    },
  });

  // Inline file inserts inside message markdown (the `:file[...]` directive).
  const fileChipComponents = useMemo(
    () => ({ file_chip: FileChip }) as Components,
    []
  );
  const fileChipPlugins = useMemo(() => [fileChipDirective], []);

  const openFileInsert = useCallback(
    (file: FileInsertTarget) => {
      const icon = fileInsertTypeToCitationIcon(file.fileType);
      if (onCitationOpen) {
        onCitationOpen({ title: file.title, icon });
        return;
      }
      setSelectedCitation({
        id: file.id ?? `file-${file.title}`,
        title: file.title,
        icon,
      });
      setIsCitationSheetOpen(true);
    },
    [onCitationOpen]
  );

  const getCitationIcon = (
    icon?: "table" | "document" | "slack" | "notion" | "image" | "frame"
  ) => {
    switch (icon) {
      case "table":
        return Table;
      case "slack":
        return SlackLogo;
      case "notion":
        return NotionLogo;
      case "image":
        return Image01;
      case "frame":
        return ActionFrame;
      case "document":
      default:
        return File02;
    }
  };

  const renderMessageBody = (message: ConversationMessage) => {
    const blocks: ReactNode[] = [];

    if (message.content) {
      blocks.push(<span key={`${message.id}-text`}>{message.content}</span>);
    }

    if (message.markdown) {
      blocks.push(
        <Markdown
          key={`${message.id}-markdown`}
          content={message.markdown}
          additionalMarkdownComponents={fileChipComponents}
          additionalMarkdownPlugins={fileChipPlugins}
        />
      );
    }

    if (message.attachments && message.attachments.length > 0) {
      blocks.push(
        <div key={`${message.id}-attachments`} className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id}
                label={attachment.label}
                icon={{ visual: File02 }}
              />
            ))}
          </div>
        </div>
      );
    }

    if (message.actionCards && message.actionCards.length > 0) {
      blocks.push(
        <div key={`${message.id}-action-cards`} className="flex flex-col gap-3">
          {message.actionCards.map((card) => {
            const state = actionCardStates.get(card.id) ?? "active";
            return (
              <ActionCardBlock
                key={card.id}
                title={card.title}
                acceptedTitle={card.acceptedTitle}
                rejectedTitle={card.rejectedTitle}
                description={card.description}
                applyLabel={card.applyLabel}
                rejectLabel={card.rejectLabel}
                cardVariant={card.cardVariant}
                actionsPosition={card.actionsPosition}
                state={state}
                onClickAccept={() => setActionCardState(card.id, "accepted")}
                onClickReject={() => setActionCardState(card.id, "rejected")}
                visual={
                  card.visual ? (
                    <Avatar
                      size="sm"
                      emoji={card.visual.emoji}
                      backgroundColor={card.visual.backgroundColor}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </div>
      );
    }

    if (message.taskSuggestionBoxes && message.taskSuggestionBoxes.length > 0) {
      const visibleBoxes = message.taskSuggestionBoxes.filter(
        (box) => !hiddenTaskSuggestionBoxIds.has(box.id)
      );

      if (visibleBoxes.length > 0) {
        blocks.push(
          <div
            key={`${message.id}-task-suggestion-boxes`}
            className="flex flex-col gap-3"
          >
            {visibleBoxes.map((box) => {
              const visibleItems = box.items.filter(
                (item) => !hiddenTaskSuggestionItemIds.has(item.id)
              );

              if (visibleItems.length === 0) {
                return null;
              }

              return (
                <SuggestionBox
                  key={box.id}
                  status="ready"
                  workingLabel="Creating tasks..."
                  title={box.title}
                  headerIcon={box.variant === "created" ? Check : undefined}
                  items={visibleItems.map((item) => {
                    const groupUser = item.groupUserId
                      ? getUserByOwnerId(item.groupUserId)
                      : undefined;

                    return {
                      id: item.id,
                      groupTitle: item.groupTitle,
                      groupVisual: groupUser ? (
                        <Avatar
                          name={groupUser.fullName}
                          visual={groupUser.portrait}
                          size="xs"
                          isRounded
                        />
                      ) : undefined,
                      text: item.text,
                    };
                  })}
                  textById={taskSuggestionTextById}
                  acceptItemLabel={
                    box.variant === "created" ? "Open task" : "Add this task"
                  }
                  acceptAllLabel={
                    box.variant === "created" ? "Go to tasks" : "Accept all"
                  }
                  acceptAllButtonVariant={
                    box.variant === "created" ? "outline" : undefined
                  }
                  acceptAllIcon={
                    box.variant === "created" ? ArrowRight : undefined
                  }
                  rejectAllLabel={
                    box.variant === "created" ? "Dismiss" : "Reject all"
                  }
                  showItemAcceptAction={box.variant !== "created"}
                  showRejectAllAction={box.variant !== "created"}
                  onTextChange={setTaskSuggestionText}
                  onAcceptItem={hideTaskSuggestionItem}
                  onAcceptAll={() => hideTaskSuggestionBox(box.id)}
                  onRejectAll={() => hideTaskSuggestionBox(box.id)}
                />
              );
            })}
          </div>
        );
      }
    }

    if (blocks.length === 0) {
      return null;
    }

    if (blocks.length === 1) {
      return blocks[0];
    }

    return <div className="flex flex-col gap-2">{blocks}</div>;
  };

  const conversationBlocks: React.ReactNode[] = [];
  let currentGroupId: string | null = null;
  let currentGroup: MessageGroupData | null = null;
  let currentGroupMessages: ConversationMessage[] = [];

  const flushGroup = () => {
    if (!currentGroup || currentGroupMessages.length === 0) {
      return;
    }

    const groupKey = `${currentGroup.id}-${currentGroupMessages[0].id}`;
    const infoChip =
      currentGroup.infoChip?.icon === "bolt" ? (
        <span className="translate-y-0.5 text-muted-foreground">
          <Icon size="xs" visual={Zap} />
        </span>
      ) : undefined;

    const groupHasDeletedMessage = currentGroupMessages.some((message) =>
      deletedMessages.has(message.id)
    );
    const completionStatus =
      currentGroup.completionStatus && !groupHasDeletedMessage ? (
        <span className="text-xs text-muted-foreground">
          {currentGroup.completionStatus}
        </span>
      ) : undefined;

    conversationBlocks.push(
      <NewConversationMessageGroup
        key={groupKey}
        type={currentGroup.type}
        avatar={
          currentGroup.avatar
            ? { ...currentGroup.avatar, name: currentGroup.name }
            : undefined
        }
        name={currentGroup.name}
        timestamp={currentGroup.timestamp}
        infoChip={infoChip}
        completionStatus={completionStatus}
        hideCompletionStatus={groupHasDeletedMessage}
        renderName={(name) => <span>{name}</span>}
      >
        {currentGroupMessages.map((message) => {
          const isDeleted = deletedMessages.has(message.id);
          const reactionsOverride = reactionOverrides.get(message.id);
          const resolvedReactions =
            reactionsOverride ?? message.reactions ?? [];
          const citations = message.citations?.map((citation) => (
            <NewCitation
              key={citation.id}
              visual={getCitationIcon(citation.icon)}
              label={citation.title}
              size="lg"
              onClick={() => {
                if (onCitationOpen) {
                  onCitationOpen({
                    title: citation.title,
                    icon: citation.icon,
                  });
                } else {
                  setSelectedCitation(citation);
                  if (citation.imgSrc) {
                    setIsImageZoomOpen(true);
                  } else {
                    setIsCitationSheetOpen(true);
                  }
                }
              }}
              {...(citation.imgSrc ? { imgSrc: citation.imgSrc } : {})}
            />
          ));

          const messageContent = isDeleted ? (
            <span className="text-sm text-muted-foreground italic">
              Message deleted
            </span>
          ) : (
            renderMessageBody(message)
          );

          if (currentGroup?.type === "agent") {
            return (
              <NewConversationAgentMessage
                key={message.id}
                citations={citations}
                onDelete={() => markDeleted(message.id)}
                hideActions={isDeleted}
                isLastMessage={message.id === lastMessageId}
              >
                {messageContent}
              </NewConversationAgentMessage>
            );
          }

          return (
            <NewConversationUserMessage
              key={message.id}
              reactions={isDeleted ? [] : resolvedReactions}
              citations={citations}
              onEmojiSelect={
                isDeleted
                  ? undefined
                  : (emoji) => toggleReaction(message.id, emoji)
              }
              onReactionClick={
                isDeleted
                  ? undefined
                  : (emoji) => toggleReaction(message.id, emoji)
              }
              onDelete={() => markDeleted(message.id)}
              onEdit={
                currentGroup?.type === "locutor" && !isDeleted
                  ? (newContent) =>
                      console.log(`Edit message ${message.id}:`, newContent)
                  : undefined
              }
              defaultEditValue={message.content ?? message.markdown ?? ""}
              hideActions={isDeleted}
              isLastMessage={message.id === lastMessageId}
            >
              {messageContent}
            </NewConversationUserMessage>
          );
        })}
      </NewConversationMessageGroup>
    );

    currentGroupId = null;
    currentGroup = null;
    currentGroupMessages = [];
  };

  itemsToDisplay.forEach((item) => {
    if (item.kind === "message") {
      if (currentGroupId !== item.group.id) {
        flushGroup();
        currentGroupId = item.group.id;
        currentGroup = item.group;
      }
      currentGroupMessages.push(item);
      return;
    }

    flushGroup();

    if (item.kind === "section") {
      conversationBlocks.push(
        <NewConversationSectionHeading key={item.id} label={item.label} />
      );
      return;
    }

    if (item.kind === "activeIndicator") {
      conversationBlocks.push(
        <NewConversationActiveIndicator
          key={item.id}
          type={item.type}
          name={item.name}
          action={item.action}
          avatar={item.avatar}
        />
      );
      return;
    }

    if (item.kind === "pendingValidation") {
      if (validationDisplayMode === "sheet") {
        return;
      }
      const block = item as ConversationPendingValidation;
      const userMsg = block.userMessage;
      const agentMsg = block.agentMessage;

      const userCitations = userMsg.citations?.map((citation) => (
        <NewCitation
          key={citation.id}
          visual={getCitationIcon(citation.icon)}
          label={citation.title}
          size="lg"
          onClick={() => {
            setSelectedCitation(citation);
            if (citation.imgSrc) {
              setIsImageZoomOpen(true);
            } else {
              setIsCitationSheetOpen(true);
            }
          }}
          {...(citation.imgSrc ? { imgSrc: citation.imgSrc } : {})}
        />
      ));
      const agentCitations = agentMsg.citations?.map((citation) => (
        <NewCitation
          key={citation.id}
          visual={getCitationIcon(citation.icon)}
          label={citation.title}
          size="lg"
          onClick={() => {
            setSelectedCitation(citation);
            if (citation.imgSrc) {
              setIsImageZoomOpen(true);
            } else {
              setIsCitationSheetOpen(true);
            }
          }}
          {...(citation.imgSrc ? { imgSrc: citation.imgSrc } : {})}
        />
      ));

      const agent = getAgentByOwnerId(agentMsg.ownerId);
      const agentAvatar = agent
        ? {
            emoji: agent.emoji,
            backgroundColor: agent.backgroundColor,
            name: agent.name,
          }
        : agentMsg.group.avatar
          ? { ...agentMsg.group.avatar, name: agentMsg.group.name }
          : undefined;

      conversationBlocks.push(
        <NewConversationPendingValidationBlock
          key={block.id}
          userMessageContent={renderMessageBody(userMsg)}
          agentMessageContent={renderMessageBody(agentMsg)}
          userGroupHeader={{ timestamp: userMsg.group.timestamp }}
          agentGroupHeader={{
            avatar: agentAvatar,
            name: agent?.name ?? agentMsg.group.name,
            timestamp: agentMsg.group.timestamp,
            completionStatus: agentMsg.group.completionStatus ? (
              <span className="text-xs text-muted-foreground">
                {agentMsg.group.completionStatus}
              </span>
            ) : undefined,
          }}
          userCitations={userCitations}
          agentCitations={agentCitations}
          onAccept={() => onAcceptPendingValidation?.(block.id)}
          onCancel={() => onCancelPendingValidation?.(block.id)}
        />
      );
    }
  });

  flushGroup();

  const pendingValidationBlock =
    validationDisplayMode === "sheet"
      ? (pendingValidationForSheet ??
        itemsToDisplay.find(
          (m): m is ConversationPendingValidation =>
            m.kind === "pendingValidation"
        ))
      : undefined;

  return (
    <FileInsertProvider openFile={openFileInsert}>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <Dialog
          open={isRenameDialogOpen}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setIsRenameDialogOpen(false);
            }
          }}
        >
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>Rename conversation</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              <Input
                value={pendingTitle}
                onChange={(event) => setPendingTitle(event.target.value)}
                placeholder="Conversation title"
              />
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: () => setIsRenameDialogOpen(false),
              }}
              rightButtonProps={{
                label: "Save",
                variant: "highlight",
                onClick: () => {
                  const trimmedTitle = pendingTitle.trim();
                  if (trimmedTitle) {
                    setDisplayTitle(trimmedTitle);
                  }
                  setIsRenameDialogOpen(false);
                },
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Messages container - scrollable */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          >
            <NewConversationContainer>
              <div ref={messagesEndRef} className="h-12 shrink-0" />
              {conversationBlocks}
              <div ref={messagesEndRef} className="h-32 shrink-0" />
            </NewConversationContainer>
          </div>
          <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-center">
            <div className="pointer-events-auto w-full max-w-4xl px-4 pb-2">
              <InputBar
                isFloating
                onSend={validationDisplayMode === "sheet" ? onSend : undefined}
              />
            </div>
          </div>
        </div>

        {/* Image citation zoom dialog */}
        {selectedCitation?.imgSrc && (
          <ImageZoomDialog
            open={isImageZoomOpen}
            onOpenChange={(open) => {
              setIsImageZoomOpen(open);
              if (!open) setSelectedCitation(null);
            }}
            image={{
              src: selectedCitation.imgSrc,
              title: selectedCitation.title,
            }}
          />
        )}

        {/* Citation Preview Sheet */}
        <Sheet
          open={isCitationSheetOpen}
          onOpenChange={(open: boolean) => {
            setIsCitationSheetOpen(open);
            if (!open) {
              setSelectedCitation(null);
              setDocumentView("preview");
            }
          }}
        >
          <SheetContent size="3xl" side="right">
            <SheetHeader>
              <SheetTitle>
                <div className="flex flex-1 flex-col w-full items-start gap-4">
                  <div className="flex items-center gap-2">
                    {selectedCitation && (
                      <Icon
                        visual={getCitationIcon(selectedCitation.icon)}
                        size="md"
                      />
                    )}
                    <span>{selectedCitation?.title || "Document View"}</span>
                  </div>
                  <div className="flex w-full items-center gap-2">
                    <ButtonsSwitchList
                      defaultValue="preview"
                      size="xs"
                      onValueChange={(value) => {
                        if (value === "preview" || value === "extracted") {
                          setDocumentView(value);
                        }
                      }}
                    >
                      <ButtonsSwitch value="preview" label="Preview" />
                      <ButtonsSwitch
                        value="extracted"
                        label="Extracted information"
                      />
                    </ButtonsSwitchList>
                    <div className="flex-1" />
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon-xs"
                        icon={Download01}
                        tooltip="Download"
                      />
                      <Button
                        variant="outline"
                        size="icon-xs"
                        icon={LinkExternal01}
                        tooltip="Open in tab"
                      />
                    </div>
                  </div>
                </div>
              </SheetTitle>
            </SheetHeader>
            <SheetContainer>
              <div className="flex flex-col items-center justify-center py-16">
                <p className="text-foreground">
                  {documentView === "preview"
                    ? "Document Preview"
                    : "Extracted information"}
                </p>
              </div>
            </SheetContainer>
          </SheetContent>
        </Sheet>

        {/* Validation Sheet (when validationDisplayMode === "sheet") */}
        {validationDisplayMode === "sheet" && pendingValidationBlock && (
          <Sheet
            open={!!pendingValidationBlock}
            onOpenChange={(open) => {
              if (!open && pendingValidationBlock) {
                onCancelPendingValidation?.(pendingValidationBlock.id);
              }
            }}
          >
            <SheetContent size="xl" side="right">
              <SheetHeader hideButton>
                <SheetTitle>@StrategyPlanner</SheetTitle>
                <SheetDescription>
                  This agent has access to sensitive data. Review the Agent's
                  message before publishing in the conversation.
                </SheetDescription>
              </SheetHeader>
              <SheetContainer>
                <div className="flex flex-col gap-4">
                  <NewConversationMessageGroup
                    type="locutor"
                    timestamp={
                      pendingValidationBlock.userMessage.group.timestamp
                    }
                  >
                    <NewConversationUserMessage
                      hideActions
                      isLastMessage
                      citations={pendingValidationBlock.userMessage.citations?.map(
                        (citation) => (
                          <NewCitation
                            key={citation.id}
                            visual={getCitationIcon(citation.icon)}
                            label={citation.title}
                            size="lg"
                            onClick={() => {
                              setSelectedCitation(citation);
                              if (citation.imgSrc) {
                                setIsImageZoomOpen(true);
                              } else {
                                setIsCitationSheetOpen(true);
                              }
                            }}
                            {...(citation.imgSrc
                              ? { imgSrc: citation.imgSrc }
                              : {})}
                          />
                        )
                      )}
                    >
                      {renderMessageBody(pendingValidationBlock.userMessage)}
                    </NewConversationUserMessage>
                  </NewConversationMessageGroup>
                  <NewConversationMessageGroup
                    type="agent"
                    avatar={(() => {
                      const agent = getAgentByOwnerId(
                        pendingValidationBlock.agentMessage.ownerId
                      );
                      return agent
                        ? {
                            emoji: agent.emoji,
                            backgroundColor: agent.backgroundColor,
                            name: agent.name,
                          }
                        : pendingValidationBlock.agentMessage.group.avatar
                          ? {
                              ...pendingValidationBlock.agentMessage.group
                                .avatar,
                              name: pendingValidationBlock.agentMessage.group
                                .name,
                            }
                          : undefined;
                    })()}
                    name={
                      getAgentByOwnerId(
                        pendingValidationBlock.agentMessage.ownerId
                      )?.name ?? pendingValidationBlock.agentMessage.group.name
                    }
                    timestamp={
                      pendingValidationBlock.agentMessage.group.timestamp
                    }
                    completionStatus={
                      pendingValidationBlock.agentMessage.group
                        .completionStatus ? (
                        <span className="text-xs text-muted-foreground">
                          {
                            pendingValidationBlock.agentMessage.group
                              .completionStatus
                          }
                        </span>
                      ) : undefined
                    }
                  >
                    <NewConversationAgentMessage
                      hideActions
                      isLastMessage
                      citations={pendingValidationBlock.agentMessage.citations?.map(
                        (citation) => (
                          <NewCitation
                            key={citation.id}
                            visual={getCitationIcon(citation.icon)}
                            label={citation.title}
                            size="lg"
                            onClick={() => {
                              setSelectedCitation(citation);
                              if (citation.imgSrc) {
                                setIsImageZoomOpen(true);
                              } else {
                                setIsCitationSheetOpen(true);
                              }
                            }}
                            {...(citation.imgSrc
                              ? { imgSrc: citation.imgSrc }
                              : {})}
                          />
                        )
                      )}
                    >
                      {renderMessageBody(pendingValidationBlock.agentMessage)}
                    </NewConversationAgentMessage>
                  </NewConversationMessageGroup>
                </div>
              </SheetContainer>
              <SheetFooter
                leftButtonProps={{
                  label: "Reject",
                  variant: "outline",
                  onClick: () =>
                    onCancelPendingValidation?.(pendingValidationBlock.id),
                }}
                rightButtonProps={{
                  label: "Publish in conversation",
                  variant: "highlight",
                  onClick: () =>
                    onAcceptPendingValidation?.(pendingValidationBlock.id),
                }}
              />
            </SheetContent>
          </Sheet>
        )}
      </div>
    </FileInsertProvider>
  );
}
