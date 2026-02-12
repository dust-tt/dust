import {
  ActionCardBlock,
  ArrowDownOnSquareIcon,
  ArrowLeftIcon,
  AttachmentChip,
  Avatar,
  Bar,
  BoltIcon,
  Breadcrumbs,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  NewCitation,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DocumentIcon,
  ExternalLinkIcon,
  FolderIcon,
  Icon,
  ImageIcon,
  ImageZoomDialog,
  Input,
  Markdown,
  MoreIcon,
  NewConversationActiveIndicator,
  NewConversationAgentMessage,
  NewConversationContainer,
  NewConversationUserMessage,
  NewConversationMessageGroup,
  NewConversationSectionHeading,
  NotionLogo,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SlackLogo,
  TableIcon,
} from "@dust-tt/sparkle";
import type { ActionCardState, BreadcrumbItem } from "@dust-tt/sparkle";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getAgentById } from "../data/agents";
import type {
  Agent,
  Conversation,
  ConversationItem,
  ConversationMessage,
  MessageCitationData,
  MessageGroupData,
  MessageGroupType,
  MessageReactionData,
  User,
} from "../data/types";
import { getUserById } from "../data/users";
import { InputBar } from "./InputBar";

interface ConversationViewProps {
  conversation: Conversation;
  locutor: User; // Current user (Locutor)
  users: User[];
  agents: Agent[];
  conversationsWithMessages: Conversation[]; // Conversations that have messages to randomly select from
  showBackButton?: boolean;
  onBack?: () => void;
  conversationTitle?: string;
  projectTitle?: string;
}

export function ConversationView({
  conversation,
  locutor,
  users,
  agents,
  conversationsWithMessages,
  showBackButton = false,
  onBack,
  conversationTitle,
  projectTitle,
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

  useEffect(() => {
    setActionCardStates(new Map(baseActionStates));
  }, [baseActionStates, conversation.id]);

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

  // Auto-scroll to bottom on mount and when conversation changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation.id, itemsToDisplay.length]);

  const breadcrumbItems: BreadcrumbItem[] = [];

  if (showBackButton && projectTitle) {
    if (onBack) {
      breadcrumbItems.push({
        label: projectTitle,
        icon: ArrowLeftIcon,
        onClick: onBack,
      });
    } else {
      breadcrumbItems.push({
        label: projectTitle,
        icon: ArrowLeftIcon,
      });
    }
  }

  breadcrumbItems.push({
    label: displayTitle,
    onClick: () => {
      setPendingTitle(displayTitle);
      setIsRenameDialogOpen(true);
    },
  });

  const getCitationIcon = (
    icon?: "table" | "document" | "slack" | "notion" | "image"
  ) => {
    switch (icon) {
      case "table":
        return TableIcon;
      case "slack":
        return SlackLogo;
      case "notion":
        return NotionLogo;
      case "image":
        return ImageIcon;
      case "document":
      default:
        return DocumentIcon;
    }
  };

  const renderMessageBody = (message: ConversationMessage) => {
    const blocks: ReactNode[] = [];

    if (message.content) {
      blocks.push(<span key={`${message.id}-text`}>{message.content}</span>);
    }

    if (message.markdown) {
      blocks.push(
        <Markdown key={`${message.id}-markdown`} content={message.markdown} />
      );
    }

    if (message.attachments && message.attachments.length > 0) {
      blocks.push(
        <div
          key={`${message.id}-attachments`}
          className="s-flex s-flex-col s-gap-2"
        >
          <div className="s-flex s-flex-wrap s-gap-2">
            {message.attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id}
                label={attachment.label}
                icon={{ visual: DocumentIcon }}
              />
            ))}
          </div>
        </div>
      );
    }

    if (message.actionCards && message.actionCards.length > 0) {
      blocks.push(
        <div
          key={`${message.id}-action-cards`}
          className="s-flex s-flex-col s-gap-3"
        >
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

    if (blocks.length === 0) {
      return null;
    }

    if (blocks.length === 1) {
      return blocks[0];
    }

    return <div className="s-flex s-flex-col s-gap-2">{blocks}</div>;
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
        <span className="s-translate-y-0.5 s-text-muted-foreground dark:s-text-muted-foreground-night">
          <Icon size="xs" visual={BoltIcon} />
        </span>
      ) : undefined;

    const groupHasDeletedMessage = currentGroupMessages.some((message) =>
      deletedMessages.has(message.id)
    );
    const completionStatus =
      currentGroup.completionStatus && !groupHasDeletedMessage ? (
        <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
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

          const messageContent = isDeleted ? (
            <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night s-italic">
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
    }
  });

  flushGroup();

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-overflow-hidden">
      <Bar
        title=" "
        description={
          <Breadcrumbs items={breadcrumbItems} size="sm" hasLighterFont />
        }
        size="sm"
        rightActions={
          <div className="s-flex s-gap-2">
            <Button size="sm" variant="ghost" icon={FolderIcon} />
            <Button size="sm" variant="ghost" icon={MoreIcon} />
          </div>
        }
        position="top"
        variant="default"
      />
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
      <div className="s-relative s-flex s-flex-1 s-flex-col s-overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="s-flex s-flex-1 s-flex-col s-overflow-y-auto"
        >
          <NewConversationContainer>
            <div ref={messagesEndRef} className="s-h-12 s-shrink-0" />
            {conversationBlocks}
            <div ref={messagesEndRef} className="s-h-32 s-shrink-0" />
          </NewConversationContainer>
        </div>
        <div className="s-pointer-events-none s-absolute s-bottom-4 s-left-0 s-right-0 s-flex s-justify-center">
          <div className="s-pointer-events-auto s-w-full s-max-w-4xl s-px-4">
            <InputBar placeholder="Ask a question" className="s-shadow-xl" />
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
              <div className="s-flex s-flex-1 s-flex-col s-w-full s-items-start s-gap-4">
                <div className="s-flex s-items-center s-gap-2">
                  {selectedCitation && (
                    <Icon
                      visual={getCitationIcon(selectedCitation.icon)}
                      size="md"
                    />
                  )}
                  <span>{selectedCitation?.title || "Document View"}</span>
                </div>
                <div className="s-flex s-w-full s-items-center s-gap-2">
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
                  <div className="s-flex-1" />
                  <div className="s-flex s-items-center s-gap-2">
                    <Button
                      variant="outline"
                      size="icon-xs"
                      icon={ArrowDownOnSquareIcon}
                      tooltip="Download"
                    />
                    <Button
                      variant="outline"
                      size="icon-xs"
                      icon={ExternalLinkIcon}
                      tooltip="Open in tab"
                    />
                  </div>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="s-flex s-flex-col s-items-center s-justify-center s-py-16">
              <p className="s-text-foreground dark:s-text-foreground-night">
                {documentView === "preview"
                  ? "Document Preview"
                  : "Extracted information"}
              </p>
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
