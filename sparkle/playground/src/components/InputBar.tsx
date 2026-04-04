import {
  ArrowUpIcon,
  AttachmentIcon,
  Avatar,
  BoltIcon,
  Button,
  ChatBubbleLeftRightIcon,
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DocumentIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FilterChips,
  Icon,
  ImageIcon,
  ImageZoomDialog,
  MicIcon,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { mockConversations } from "../data/conversations";
import { getAggregatedWorkspaceDataSources } from "../data/dataSources";
import { getAgentAvatarProps, getAgentById, mockAgents } from "../data";
import type { Conversation, DataSource } from "../data/types";
import { getFakeDocumentDescription } from "../utils/attachSearchHelpers";
import { getConversationIdFromDataTransfer } from "../utils/conversationAttachDnD";

import { NewCitation, NewCitationGrid } from "./NewCitation";
import { RichTextArea, type RichTextAreaHandle } from "./RichTextArea";

const ATTACH_FILTER_LABELS = [
  "All",
  "PDF",
  "Word",
  "Excel",
  "PowerPoint",
  "Text",
  "Markdown",
  "DOC",
  "Conversations",
] as const;

type AttachFilterLabel = (typeof ATTACH_FILTER_LABELS)[number];

function docTypeForAttachFilter(
  label: AttachFilterLabel
): DataSource["fileType"] | null {
  switch (label) {
    case "All":
    case "Conversations":
      return null;
    case "PDF":
      return "pdf";
    case "Word":
      return "docx";
    case "Excel":
      return "xlsx";
    case "PowerPoint":
      return "pptx";
    case "Text":
      return "txt";
    case "Markdown":
      return "md";
    case "DOC":
      return "doc";
  }
}

export type AttachedItem =
  | { kind: "file"; id: string; file: File; objectUrl?: string }
  | { kind: "dataSource"; id: string; dataSource: DataSource }
  | { kind: "conversation"; id: string; conversation: Conversation };

type CitationPreview =
  | { kind: "file"; id: string; file: File; objectUrl?: string }
  | { kind: "dataSource"; id: string; dataSource: DataSource }
  | { kind: "conversation"; id: string; conversation: Conversation };

export interface InputBarForkWithContext {
  sourceConversationId: string;
  onConfirm: (newAgentId: string) => void;
}

interface InputBarProps {
  placeholder?: string;
  className?: string;
  instructionReference?: { start: number; end: number } | null;
  onInstructionInserted?: () => void;
  /** When set with initialAgentId, switching threads resets the bar agent. */
  conversationKey?: string;
  /** Primary agent for the current thread (e.g. first agent participant). */
  initialAgentId?: string;
  /** When set, choosing another agent opens a confirm dialog before forking. */
  forkWithContext?: InputBarForkWithContext;
  /** Welcome / composer: send creates a conversation with the current text and agent. */
  onComposerSubmit?: (payload: { text: string; agentId: string }) => void;
  /** Conversations offered in the attach picker; defaults to playground mock list. */
  attachConversations?: Conversation[];
}

export function InputBar({
  placeholder = "Ask a question",
  className,
  instructionReference,
  onInstructionInserted,
  conversationKey,
  initialAgentId,
  forkWithContext,
  onComposerSubmit,
  attachConversations: attachConversationsProp,
}: InputBarProps) {
  const attachConversations = attachConversationsProp ?? mockConversations;

  const [isFocused, setIsFocused] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachedItems, setAttachedItems] = useState<AttachedItem[]>([]);
  const [selectedPreview, setSelectedPreview] =
    useState<CitationPreview | null>(null);
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false);
  const [isCitationSheetOpen, setIsCitationSheetOpen] = useState(false);
  const [mentionAgentSearch, setMentionAgentSearch] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState(
    initialAgentId && initialAgentId !== "" ? initialAgentId : "agent-dust"
  );
  const [isForkDialogOpen, setIsForkDialogOpen] = useState(false);
  const [pendingForkAgentId, setPendingForkAgentId] = useState<string | null>(
    null
  );
  const [attachMobileOpen, setAttachMobileOpen] = useState(false);
  const [attachDesktopOpen, setAttachDesktopOpen] = useState(false);
  const [attachQuery, setAttachQuery] = useState("");
  const [attachFilter, setAttachFilter] = useState<AttachFilterLabel>("All");

  const containerRef = useRef<HTMLDivElement>(null);
  const richTextAreaRef = useRef<RichTextAreaHandle | null>(null);
  const dragCounterRef = useRef(0);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const selectedPreviewRef = useRef<CitationPreview | null>(null);
  selectedPreviewRef.current = selectedPreview;

  const workspaceDocuments = useMemo(
    () => getAggregatedWorkspaceDataSources(),
    []
  );

  const closeAttachMenus = useCallback(() => {
    setAttachMobileOpen(false);
    setAttachDesktopOpen(false);
    setAttachQuery("");
  }, []);

  const attachPickResults = useMemo(() => {
    const q = attachQuery.trim().toLowerCase();
    if (!q) {
      return {
        documents: [] as DataSource[],
        conversations: [] as Conversation[],
      };
    }

    const includeConversations =
      attachFilter === "All" || attachFilter === "Conversations";
    const includeDocuments = attachFilter !== "Conversations";
    const docTypeOnly: DataSource["fileType"] | null =
      attachFilter === "All" || attachFilter === "Conversations"
        ? null
        : docTypeForAttachFilter(attachFilter);

    let documents: DataSource[] = [];
    if (includeDocuments) {
      documents = workspaceDocuments.filter((ds) => {
        if (docTypeOnly != null && ds.fileType !== docTypeOnly) {
          return false;
        }
        const desc = getFakeDocumentDescription(ds);
        const haystack = `${ds.fileName}\n${desc}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    let conversations: Conversation[] = [];
    if (includeConversations) {
      conversations = attachConversations.filter((c) => {
        const haystack = `${c.title}\n${c.description ?? ""}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    return { documents, conversations };
  }, [attachConversations, attachFilter, attachQuery, workspaceDocuments]);

  const addAttachedDataSource = useCallback((dataSource: DataSource) => {
    const id = `attach-ds-${dataSource.id}`;
    setAttachedItems((prev) => {
      if (prev.some((p) => p.id === id)) return prev;
      return [...prev, { kind: "dataSource", id, dataSource }];
    });
  }, []);

  const addAttachedConversation = useCallback((conversation: Conversation) => {
    const id = `attach-conv-${conversation.id}`;
    setAttachedItems((prev) => {
      if (prev.some((p) => p.id === id)) return prev;
      return [...prev, { kind: "conversation", id, conversation }];
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsFocused(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      setIsFocused(true);
      const files = e.dataTransfer.files;
      if (files?.length) {
        const newItems: AttachedItem[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file) {
            const isImage = file.type.startsWith("image/");
            const objectUrl = isImage ? URL.createObjectURL(file) : undefined;
            if (objectUrl) objectUrlsRef.current.add(objectUrl);
            newItems.push({
              kind: "file",
              id: `${file.name}-${i}-${Date.now()}`,
              file,
              objectUrl,
            });
          }
        }
        setAttachedItems((prev) => [...prev, ...newItems]);
      }
      const convId = getConversationIdFromDataTransfer(e.dataTransfer);
      if (convId) {
        const conv = attachConversations.find((c) => c.id === convId);
        if (conv) {
          addAttachedConversation(conv);
        }
      }
    },
    [addAttachedConversation, attachConversations]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachedItems((prev) => {
      const item = prev.find((x) => x.id === id);
      if (item?.kind === "file" && item.objectUrl) {
        URL.revokeObjectURL(item.objectUrl);
        objectUrlsRef.current.delete(item.objectUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
    if (selectedPreviewRef.current?.id === id) {
      setSelectedPreview(null);
      setIsImageZoomOpen(false);
      setIsCitationSheetOpen(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!instructionReference) {
      return;
    }

    const { start, end } = instructionReference;
    const label = `Snippet (${start}-${end})`;
    richTextAreaRef.current?.insertInstructionSnippet({
      id: `instruction-${start}-${end}`,
      label,
    });
    onInstructionInserted?.();
  }, [instructionReference, onInstructionInserted]);

  useEffect(() => {
    if (initialAgentId != null && initialAgentId !== "") {
      setSelectedAgentId(initialAgentId);
    }
  }, [conversationKey, initialAgentId]);

  const selectedAgent = useMemo(
    () => getAgentById(selectedAgentId) ?? mockAgents[0],
    [selectedAgentId]
  );

  const agentTriggerVisual = useMemo(
    () =>
      function AgentTriggerVisual({ className }: { className?: string }) {
        return (
          <Avatar
            className={className}
            size="xxs"
            {...getAgentAvatarProps(selectedAgent)}
          />
        );
      },
    [selectedAgent]
  );

  const filteredMentionAgents = useMemo(() => {
    const q = mentionAgentSearch.trim().toLowerCase();
    const base = q
      ? mockAgents.filter((a) => a.name.toLowerCase().includes(q))
      : mockAgents;
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [mentionAgentSearch]);

  const showFocusStyle = isFocused || isDragOver;

  const handleSendClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onComposerSubmit) return;
      const text = (richTextAreaRef.current?.getText() ?? "").trim();
      if (!text) return;
      onComposerSubmit({ text, agentId: selectedAgentId });
      richTextAreaRef.current?.setContent("");
    },
    [onComposerSubmit, selectedAgentId]
  );

  const attachDropdownHeaders = (
    <div className="s-flex s-flex-col s-gap-2 s-pb-2">
      <DropdownMenuSearchbar
        value={attachQuery}
        onChange={setAttachQuery}
        name="input-bar-attach-search"
        placeholder="Search documents and conversations"
      />
      <div className="s-px-1" onPointerDown={(e) => e.preventDefault()}>
        <FilterChips
          filters={[...ATTACH_FILTER_LABELS]}
          selectedFilter={attachFilter}
          onFilterClick={(f) => setAttachFilter(f)}
        />
      </div>
    </div>
  );

  const hasAttachQuery = attachQuery.trim().length > 0;
  const attachListEmpty =
    hasAttachQuery &&
    attachPickResults.documents.length === 0 &&
    attachPickResults.conversations.length === 0;

  const renderAttachMenuBody = (afterSelect: () => void) => (
    <>
      <DropdownMenuSeparator />
      {!hasAttachQuery ? (
        <div className="s-flex s-h-24 s-items-center s-justify-center s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
          Type to search
        </div>
      ) : attachListEmpty ? (
        <div className="s-flex s-h-24 s-items-center s-justify-center s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
          No results found
        </div>
      ) : (
        <div className="s-flex s-flex-col s-pb-2">
          {attachPickResults.documents.map((ds) => (
            <DropdownMenuItem
              key={ds.id}
              label={ds.fileName}
              description={getFakeDocumentDescription(ds)}
              icon={<Icon visual={ds.icon ?? DocumentIcon} size="sm" />}
              truncateText
              onSelect={() => {
                addAttachedDataSource(ds);
                afterSelect();
              }}
            />
          ))}
          {attachPickResults.conversations.map((c) => (
            <DropdownMenuItem
              key={c.id}
              label={c.title}
              description={c.description}
              icon={<Icon visual={ChatBubbleLeftRightIcon} size="sm" />}
              truncateText
              onSelect={() => {
                addAttachedConversation(c);
                afterSelect();
              }}
            />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div
      ref={containerRef}
      onClick={handleFocus}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "s-relative s-w-full s-max-w-4xl s-z-10",
        "s-rounded-3xl s-border s-bg-primary-50/70 dark:s-bg-primary-900/70 s-backdrop-blur-md s-transition-all",
        showFocusStyle
          ? "s-border-highlight-300 dark:s-border-highlight-300-night s-ring-2 s-ring-highlight-300/50 dark:s-ring-highlight-700/60"
          : "s-border-border dark:s-border-border-night",
        className
      )}
    >
      <div className="s-flex s-w-full s-flex-col">
        {attachedItems.length > 0 && (
          <NewCitationGrid
            className="s-pt-2 s-px-2 s-pb-0 s-w-full"
            justify="start"
          >
            {attachedItems.map((item) => {
              if (item.kind === "file") {
                const { id, file, objectUrl } = item;
                return (
                  <NewCitation
                    key={id}
                    label={file.name}
                    size="lg"
                    visual={
                      file.type.startsWith("image/") ? ImageIcon : DocumentIcon
                    }
                    variant="secondary"
                    imgSrc={objectUrl}
                    onClick={() => {
                      setSelectedPreview(item);
                      if (objectUrl) {
                        setIsImageZoomOpen(true);
                      } else {
                        setIsCitationSheetOpen(true);
                      }
                    }}
                    onClose={() => removeAttachment(id)}
                  />
                );
              }
              if (item.kind === "dataSource") {
                const { id, dataSource } = item;
                return (
                  <NewCitation
                    key={id}
                    label={dataSource.fileName}
                    size="lg"
                    visual={dataSource.icon ?? DocumentIcon}
                    variant="secondary"
                    onClick={() => {
                      setSelectedPreview(item);
                      setIsCitationSheetOpen(true);
                    }}
                    onClose={() => removeAttachment(id)}
                  />
                );
              }
              const { id, conversation } = item;
              return (
                <NewCitation
                  key={id}
                  label={conversation.title}
                  size="lg"
                  visual={ChatBubbleLeftRightIcon}
                  variant="secondary"
                  onClick={() => {
                    setSelectedPreview(item);
                    setIsCitationSheetOpen(true);
                  }}
                  onClose={() => removeAttachment(id)}
                />
              );
            })}
          </NewCitationGrid>
        )}
        <RichTextArea
          ref={richTextAreaRef}
          placeholder={placeholder}
          onFocus={handleFocus}
          variant="compact"
          showFormattingMenu
          showAskSidekickMenu={false}
          className="placeholder:s-text-muted-foreground dark:placeholder:s-text-muted-foreground-night"
        />
        <div className="s-flex s-w-full s-gap-2 s-p-2.5">
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) setMentionAgentSearch("");
            }}
            modal={false}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost-secondary"
                icon={agentTriggerVisual}
                size="sm"
                label={selectedAgent.name}
                tooltip="Mention an agent"
                isSelect
                className="s-max-w-[44vw] sm:s-max-w-[11rem]"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                }}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="s-w-[min(380px,calc(100vw-2rem))]"
              dropdownHeaders={
                <DropdownMenuSearchbar
                  value={mentionAgentSearch}
                  onChange={setMentionAgentSearch}
                  name="input-bar-mention-agent"
                  placeholder="Search agents"
                />
              }
            >
              <DropdownMenuSeparator />
              {filteredMentionAgents.length > 0 ? (
                filteredMentionAgents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    label={agent.name}
                    description={agent.description}
                    icon={<Avatar size="sm" {...getAgentAvatarProps(agent)} />}
                    onSelect={() => {
                      setMentionAgentSearch("");
                      if (forkWithContext && agent.id !== selectedAgentId) {
                        setPendingForkAgentId(agent.id);
                        setIsForkDialogOpen(true);
                        return;
                      }
                      setSelectedAgentId(agent.id);
                    }}
                    truncateText
                  />
                ))
              ) : (
                <div className="s-flex s-h-24 s-items-center s-justify-center s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                  No agents found
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu
            open={attachMobileOpen}
            onOpenChange={(open) => {
              setAttachMobileOpen(open);
              if (!open) setAttachQuery("");
            }}
            modal={false}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                icon={PlusIcon}
                size="sm"
                tooltip="Attach a document"
                className="md:s-hidden"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="s-w-[min(380px,calc(100vw-2rem))]"
              dropdownHeaders={attachDropdownHeaders}
            >
              {renderAttachMenuBody(closeAttachMenus)}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="s-hidden s-gap-0 md:s-flex">
            <DropdownMenu
              open={attachDesktopOpen}
              onOpenChange={(open) => {
                setAttachDesktopOpen(open);
                if (!open) setAttachQuery("");
              }}
              modal={false}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost-secondary"
                  icon={AttachmentIcon}
                  size="sm"
                  tooltip="Attach a document"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="s-w-[min(380px,calc(100vw-2rem))]"
                dropdownHeaders={attachDropdownHeaders}
              >
                {renderAttachMenuBody(closeAttachMenus)}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost-secondary"
              icon={BoltIcon}
              size="sm"
              tooltip="Add functionality"
            />
          </div>
          <div className="s-grow" />
          <div className="s-flex s-items-center s-gap-2 md:s-gap-1">
            <Button variant="ghost-secondary" icon={MicIcon} size="sm" />
            <Button
              variant="highlight"
              icon={ArrowUpIcon}
              size="sm"
              tooltip="Send message"
              isRounded
              onClick={onComposerSubmit ? handleSendClick : undefined}
            />
          </div>
        </div>
      </div>

      <Dialog
        open={isForkDialogOpen}
        onOpenChange={(open) => {
          setIsForkDialogOpen(open);
          if (!open) setPendingForkAgentId(null);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>New conversation</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <p className="s-text-sm s-text-foreground dark:s-text-foreground-night">
              Would you like to open a new conversation with{" "}
              <span className="s-font-semibold">
                {pendingForkAgentId
                  ? (getAgentById(pendingForkAgentId)?.name ?? "this agent")
                  : ""}
              </span>{" "}
              and bring this conversation as context?
            </p>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setIsForkDialogOpen(false);
                setPendingForkAgentId(null);
              },
            }}
            rightButtonProps={{
              label: "New conversation",
              variant: "highlight",
              onClick: () => {
                if (pendingForkAgentId && forkWithContext) {
                  forkWithContext.onConfirm(pendingForkAgentId);
                  setSelectedAgentId(pendingForkAgentId);
                }
                setIsForkDialogOpen(false);
                setPendingForkAgentId(null);
              },
            }}
          />
        </DialogContent>
      </Dialog>

      {selectedPreview?.kind === "file" && selectedPreview.objectUrl && (
        <ImageZoomDialog
          open={isImageZoomOpen}
          onOpenChange={(open) => {
            setIsImageZoomOpen(open);
            if (!open) setSelectedPreview(null);
          }}
          image={{
            src: selectedPreview.objectUrl,
            title: selectedPreview.file.name,
          }}
        />
      )}

      <Sheet
        open={isCitationSheetOpen}
        onOpenChange={(open) => {
          setIsCitationSheetOpen(open);
          if (!open) setSelectedPreview(null);
        }}
      >
        <SheetContent size="3xl" side="right">
          <SheetHeader>
            <SheetTitle>
              <div className="s-flex s-flex-1 s-flex-col s-w-full s-items-start s-gap-4">
                <div className="s-flex s-items-center s-gap-2">
                  {selectedPreview?.kind === "file" && (
                    <Icon visual={DocumentIcon} size="md" />
                  )}
                  {selectedPreview?.kind === "dataSource" && (
                    <Icon
                      visual={selectedPreview.dataSource.icon ?? DocumentIcon}
                      size="md"
                    />
                  )}
                  {selectedPreview?.kind === "conversation" && (
                    <Icon visual={ChatBubbleLeftRightIcon} size="md" />
                  )}
                  <span>
                    {selectedPreview?.kind === "file"
                      ? selectedPreview.file.name
                      : selectedPreview?.kind === "dataSource"
                        ? selectedPreview.dataSource.fileName
                        : selectedPreview?.kind === "conversation"
                          ? selectedPreview.conversation.title
                          : "Preview"}
                  </span>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="s-flex s-flex-col s-items-center s-justify-center s-py-16">
              {selectedPreview?.kind === "file" && (
                <p className="s-text-foreground dark:s-text-foreground-night">
                  Document preview — {selectedPreview.file.type || "file"}
                </p>
              )}
              {selectedPreview?.kind === "dataSource" && (
                <p className="s-text-foreground dark:s-text-foreground-night">
                  {getFakeDocumentDescription(selectedPreview.dataSource)}
                </p>
              )}
              {selectedPreview?.kind === "conversation" && (
                <p className="s-text-foreground dark:s-text-foreground-night">
                  {selectedPreview.conversation.description ??
                    "Conversation preview — stub content for the playground."}
                </p>
              )}
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
