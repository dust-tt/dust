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
  NewConversationActiveIndicator,
  NewConversationAgentMessage,
  NewConversationContainer,
  NewConversationMessageGroup,
  NewConversationSectionHeading,
  NewConversationUserMessage,
} from "./NewConversationMessages";
import { NewCitation } from "./NewCitation";
import {
  type ReactNode,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  Agent,
  Conversation,
  ConversationItem,
  ConversationMessage,
  MessageCitationData,
  MessageGroupData,
  MessageReactionData,
  User,
} from "../data/types";
import { buildConversationItemsToDisplay } from "./conversationItems";
import { InputBar } from "./InputBar";

export type ConversationThreadVariant = "default" | "solo" | "groupThread";

export interface ConversationThreadCoreProps {
  conversation: Conversation;
  locutor: User;
  users: User[];
  agents: Agent[];
  conversationsWithMessages: Conversation[];
  showBackButton?: boolean;
  onBack?: () => void;
  conversationTitle?: string;
  projectTitle?: string;
  variant?: ConversationThreadVariant;
  onForkConversationWithContext?: (payload: {
    newAgentId: string;
    sourceConversation: Conversation;
  }) => void;
}

export function ConversationThreadCore({
  conversation,
  locutor,
  users,
  agents,
  conversationsWithMessages,
  showBackButton = false,
  onBack,
  conversationTitle,
  projectTitle,
  variant = "default",
  onForkConversationWithContext,
}: ConversationThreadCoreProps) {
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

  const rawItemsToDisplay: ConversationItem[] = useMemo(
    () =>
      buildConversationItemsToDisplay({
        conversation,
        locutor,
        users,
        agents,
        conversationsWithMessages,
      }),
    [conversation, locutor, users, agents, conversationsWithMessages]
  );

  const itemsToDisplay: ConversationItem[] = useMemo(() => {
    if (variant !== "solo") {
      return rawItemsToDisplay;
    }
    return rawItemsToDisplay.map((item) => {
      if (item.kind === "message") {
        return {
          ...item,
          group: {
            ...item.group,
            name: undefined,
            avatar: undefined,
          },
        };
      }
      if (item.kind === "activeIndicator") {
        return {
          ...item,
          name: undefined,
          avatar: undefined,
        };
      }
      return item;
    });
  }, [variant, rawItemsToDisplay]);

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

  if (variant !== "solo" && showBackButton && projectTitle) {
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

  if (variant !== "solo") {
    breadcrumbItems.push({
      label: displayTitle,
      onClick: () => {
        setPendingTitle(displayTitle);
        setIsRenameDialogOpen(true);
      },
    });
  }

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
            const agentBubble = (
              <NewConversationAgentMessage
                citations={citations}
                onDelete={() => markDeleted(message.id)}
                hideActions={isDeleted}
                isLastMessage={message.id === lastMessageId}
              >
                {messageContent}
              </NewConversationAgentMessage>
            );
            if (variant === "groupThread" && !isDeleted) {
              return (
                <div
                  key={message.id}
                  className="s-rounded-xl s-border s-border-border s-p-2 dark:s-border-border-night"
                >
                  {agentBubble}
                </div>
              );
            }
            return <Fragment key={message.id}>{agentBubble}</Fragment>;
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
      {variant === "solo" ? (
        <div className="s-flex s-h-14 s-shrink-0 s-items-center s-gap-2 s-border-b s-border-border s-px-4 dark:s-border-border-night">
          {showBackButton && onBack ? (
            <Button
              variant="ghost"
              size="sm"
              icon={ArrowLeftIcon}
              onClick={onBack}
              aria-label="Back"
            />
          ) : null}
          <button
            type="button"
            className="s-min-w-0 s-flex-1 s-truncate s-text-left s-heading-sm s-text-foreground dark:s-text-foreground-night hover:s-opacity-80"
            onClick={() => {
              setPendingTitle(displayTitle);
              setIsRenameDialogOpen(true);
            }}
          >
            {displayTitle}
          </button>
        </div>
      ) : (
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
      )}
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
            <InputBar
              placeholder="Ask a question"
              className="s-shadow-xl"
              conversationKey={conversation.id}
              initialAgentId={conversation.agentParticipants[0] ?? "agent-dust"}
              forkWithContext={
                onForkConversationWithContext
                  ? {
                      sourceConversationId: conversation.id,
                      onConfirm: (newAgentId: string) =>
                        onForkConversationWithContext({
                          newAgentId,
                          sourceConversation: conversation,
                        }),
                    }
                  : undefined
              }
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
