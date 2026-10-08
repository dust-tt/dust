import {
  Breadcrumbs,
  Button,
  Chip,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Folder,
  Markdown,
  MessageCircle01,
  NavigationList,
  NavigationListItem,
  ScrollArea,
  ScrollBar,
  Settings01,
} from "@dust-tt/sparkle";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { getDataSourceIcon } from "../data/dataSources";
import type { DataSource } from "../data/types";
import type {
  AgentMessage,
  ChatAgent,
  ChatFile,
  Conversation,
  Conversations,
} from "../lib/coEdition";
import { ConversationFilesPanel } from "./ConversationSidePanels";
import {
  type CommentStyle,
  type CommentsVariant,
  type DocBackground,
  DocumentPanel,
} from "./doc/DocumentPanel";
import type { DocSession } from "./doc/docTypes";
import {
  INPUT_BAR_PILL_HOVER_CLASSNAME,
  INPUT_BAR_PILL_SURFACE_CLASSNAME,
  InputBar,
} from "./InputBar";
import { NewCitation } from "./NewCitation";
import {
  NewConversationAgentMessage,
  NewConversationContainer,
  NewConversationMessageGroup,
  NewConversationUserMessage,
} from "./NewConversationMessages";
import { PanelLayout, PanelLayoutNav, PanelLayoutPanel } from "./PanelLayout";

// Dust's conversation layout (sidebar, conversation + composer, files side
// panel) with a document co-edition panel next to the conversation.

// ── Helpers ──────────────────────────────────────────────────────────────────

// A design setting remembered per conversation in this browser, so each
// conversation keeps the design it's testing.
function usePerConversationSetting<T extends string>(storageKey: string) {
  const [values, setValues] = useState<Record<string, T>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    } catch {
      return {};
    }
  });
  const setValue = useCallback(
    (conversationId: string, value: T) =>
      setValues((prev) => ({ ...prev, [conversationId]: value })),
    []
  );
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
      // Not persisted (storage unavailable); still applies for this visit.
    }
  }, [storageKey, values]);
  return [values, setValue] as const;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toDataSource(file: ChatFile): DataSource {
  return {
    id: file.key,
    kind: "file",
    fileName: file.title,
    parentId: null,
    source: "pod",
    fileType: "md",
    createdBy: "",
    createdAt: file.createdAt,
    updatedAt: file.createdAt,
  };
}

// Each document once, even when several replies touch it.
function conversationFiles(conversation: Conversation): ChatFile[] {
  const byKey = new Map<string, ChatFile>();
  for (const message of conversation.messages) {
    if (message.role === "agent") {
      for (const file of message.files) {
        if (!byKey.has(file.key)) {
          byKey.set(file.key, file);
        }
      }
    }
  }
  return [...byKey.values()];
}

// "documents__edit" → "Documents: edit" (toolset + tool).
function toolLabel(name: string): string {
  const [toolset, tool] = name.includes("__") ? name.split("__") : ["", name];
  const words = (value: string) => value.replace(/_/g, " ");
  const label = toolset ? `${words(toolset)}: ${words(tool)}` : words(tool);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function agentStatusLabel(message: AgentMessage): string | null {
  if (message.status !== "streaming") {
    return null;
  }
  const runningTool = message.tools.find((t) => t.status === "running");
  if (runningTool) {
    return `${toolLabel(runningTool.name)}…`;
  }
  return message.content ? "Writing…" : "Thinking…";
}

// ── Agent picker (in the composer, where Dust puts it) ──────────────────────

function AgentPicker({
  agents,
  selected,
  onSelect,
}: {
  agents: ChatAgent[];
  selected: ChatAgent;
  onSelect: (agent: ChatAgent) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          size="xs"
          isRounded
          isSelect
          label={`@${selected.name}`}
          className={cn(
            INPUT_BAR_PILL_SURFACE_CLASSNAME,
            INPUT_BAR_PILL_HOVER_CLASSNAME
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
        {agents.map((agent) => (
          <DropdownMenuItem
            key={agent.id}
            label={agent.name}
            description={agent.description}
            onClick={() => onSelect(agent)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Conversation (messages + floating composer) ──────────────────────────────

function AgentMessageBody({
  message,
  onOpenFile,
}: {
  message: AgentMessage;
  onOpenFile: (file: ChatFile) => void;
}) {
  // Links to a document of the reply open it in the side panel.
  const markdownComponents = {
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      const file = message.files.find((f) => f.key === href);
      if (!file) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-highlight-600 underline"
          >
            {children}
          </a>
        );
      }
      return (
        <button
          type="button"
          className="text-highlight-600 hover:underline"
          onClick={() => onOpenFile(file)}
        >
          {children}
        </button>
      );
    },
  };

  return (
    <div className="flex flex-col gap-3">
      {message.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.tools.map((tool) => (
            <Chip
              key={tool.id}
              size="xs"
              label={toolLabel(tool.name)}
              icon={Settings01}
              isBusy={tool.status === "running"}
              color="primary"
            />
          ))}
        </div>
      )}
      {message.content && (
        <Markdown
          content={message.content}
          isStreaming={message.status === "streaming"}
          additionalMarkdownComponents={markdownComponents}
        />
      )}
    </div>
  );
}

function ConversationView({
  conversation,
  agents,
  selectedAgent,
  onSelectAgent,
  onSend,
  onOpenFile,
  isGrey,
  subtitle,
}: {
  conversation: Conversation;
  agents: ChatAgent[];
  selectedAgent: ChatAgent;
  onSelectAgent: (agent: ChatAgent) => void;
  onSend: (text: string) => void;
  onOpenFile: (file: ChatFile) => void;
  /** Prototype option: grey conversation, with white user messages. */
  isGrey: boolean;
  /** Under the empty conversation's heading. */
  subtitle: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastMessageId =
    conversation.messages[conversation.messages.length - 1]?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation.messages]);

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden",
        isGrey && "bg-muted-background"
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {conversation.messages.length === 0 ? (
          <div className="m-auto pb-32 text-center">
            <div className="heading-2xl text-foreground">
              {`Ask @${selectedAgent.name} anything`}
            </div>
            <div className="pt-2 text-muted-foreground">{subtitle}</div>
          </div>
        ) : (
          <NewConversationContainer>
            <div className="h-12 shrink-0" />
            {conversation.messages.map((message) =>
              message.role === "user" ? (
                <NewConversationMessageGroup
                  key={message.id}
                  type="locutor"
                  timestamp={formatTime(message.createdAt)}
                >
                  <NewConversationUserMessage
                    className={isGrey ? "bg-background" : undefined}
                    hideActions
                    isLastMessage={message.id === lastMessageId}
                  >
                    {message.content}
                  </NewConversationUserMessage>
                </NewConversationMessageGroup>
              ) : (
                <NewConversationMessageGroup
                  key={message.id}
                  type="agent"
                  avatar={{
                    visual: message.agent.pictureUrl,
                    name: message.agent.name,
                    busy: message.status === "streaming",
                  }}
                  name={message.agent.name}
                  timestamp={formatTime(message.createdAt)}
                  completionStatus={
                    agentStatusLabel(message) ? (
                      <span className="text-xs text-muted-foreground">
                        {agentStatusLabel(message)}
                      </span>
                    ) : undefined
                  }
                >
                  <NewConversationAgentMessage
                    hideActions={message.status === "streaming"}
                    isLastMessage={message.id === lastMessageId}
                    citations={message.files.map((file) => (
                      <NewCitation
                        key={file.key}
                        visual={getDataSourceIcon(toDataSource(file))}
                        label={file.title}
                        size="lg"
                        onClick={() => onOpenFile(file)}
                      />
                    ))}
                  >
                    <AgentMessageBody
                      message={message}
                      onOpenFile={onOpenFile}
                    />
                  </NewConversationAgentMessage>
                </NewConversationMessageGroup>
              )
            )}
            <div ref={endRef} className="h-32 shrink-0" />
          </NewConversationContainer>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-center">
        <div className="pointer-events-auto w-full max-w-4xl px-4 pb-2">
          <InputBar
            isFloating
            autoFocus
            placeholder="Ask a question or get some work done…"
            agentPicker={
              <AgentPicker
                agents={agents}
                selected={selectedAgent}
                onSelect={onSelectAgent}
              />
            }
            onSubmitText={onSend}
          />
        </div>
      </div>
    </div>
  );
}

// ── Conversations + documents ───────────────────────────────────────────────

export function AgentConversations({
  conversations: conversationsApi,
  subtitle,
  openDocumentOnLoad = false,
  defaultCommentsVariant = "list",
  defaultCommentStyle = "default",
}: {
  conversations: Conversations;
  subtitle: string;
  /** Opens the active conversation's first document on load. */
  openDocumentOnLoad?: boolean;
  /** Comments design for conversations that haven't picked one. */
  defaultCommentsVariant?: CommentsVariant;
  defaultCommentStyle?: CommentStyle;
}) {
  const {
    agents,
    conversations,
    active,
    setActiveId,
    startNewConversation,
    send,
    askFromComment,
    readFile,
  } = conversationsApi;
  const [agentId, setAgentId] = useState<string | null>(null);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [openFile, setOpenFile] = useState<ChatFile | null>(null);
  // Co-edition state per document, keyed by conversation and file.
  const [docSessions, setDocSessions] = useState<Record<string, DocSession>>(
    {}
  );
  const docKey = openFile ? `${active.id}:${openFile.key}` : null;
  const [commentsVariants, setCommentsVariant] =
    usePerConversationSetting<CommentsVariant>("co-edition-comments-variants");
  const [docBackgrounds, setDocBackground] =
    usePerConversationSetting<DocBackground>("co-edition-doc-backgrounds");
  const [commentStyles, setCommentStyle] =
    usePerConversationSetting<CommentStyle>("co-edition-comment-styles");
  // Slot in the document panel's top bar where DocumentPanel renders its
  // actions (comments, download, prototype options).
  const [docToolbarSlot, setDocToolbarSlot] = useState<HTMLDivElement | null>(
    null
  );
  const background: DocBackground = docBackgrounds[active.id] || "white";

  const selectedAgent =
    agents.find((a) => a.id === agentId) ??
    agents.find((a) => a.id === "dust") ??
    agents[0];
  const files = conversationFiles(active);

  const closeSidePanels = () => {
    setIsFilesOpen(false);
    setOpenFile(null);
  };

  // A document gets the room it needs to be edited: the Files list closes.
  const openFileInPanel = (file: ChatFile) => {
    setIsFilesOpen(false);
    setOpenFile(file);
  };

  useEffect(() => {
    if (!openDocumentOnLoad) {
      return;
    }
    const [document] = conversationFiles(active);
    if (document) {
      openFileInPanel(document);
    }
    // Runs once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectConversation = (id: string) => {
    setActiveId(id);
    closeSidePanels();
  };

  const handleSend = (text: string) => {
    if (active.isRunning) {
      return;
    }
    const docSession = docKey ? docSessions[docKey] : undefined;
    void send(
      active,
      text,
      selectedAgent,
      openFile && docSession
        ? { fileKey: openFile.key, markdown: docSession.markdown }
        : undefined
    );
  };

  // `onNavClose` hides the sidebar when it overlays the panels (narrow
  // screens), once a conversation is picked or created.
  const renderNav = (onNavClose: () => void) => (
    <div className="flex min-h-0 flex-1 flex-col bg-app-background">
      <ScrollArea className="flex-1">
        <ScrollBar orientation="vertical" size="minimal" />
        <div className="flex items-center justify-between gap-2 p-sidebar-side-spacing">
          <span className="heading-sm text-foreground">Conversations</span>
          <Button
            variant="highlight"
            tooltip="Create a new conversation"
            size="sm"
            icon={MessageCircle01}
            label="New"
            onClick={() => {
              startNewConversation();
              closeSidePanels();
              onNavClose();
            }}
          />
        </div>
        <NavigationList className="mx-sidebar-side-spacing pt-1">
          {conversations.map((conversation) => (
            <NavigationListItem
              key={conversation.id}
              label={conversation.title}
              labelAnimation={conversation.isRunning ? "streaming" : "none"}
              selected={conversation.id === active.id}
              onClick={() => {
                selectConversation(conversation.id);
                onNavClose();
              }}
            />
          ))}
        </NavigationList>
      </ScrollArea>
    </div>
  );

  return (
    <PanelLayout>
      <PanelLayoutNav>{renderNav}</PanelLayoutNav>

      <PanelLayoutPanel
        label={active.title}
        isOpen={true}
        onClose={() => {}}
        // Never narrower than this, including when the document panel is
        // dragged wider.
        minimalWidth={400}
        tone={background === "grey-conversation" ? "muted" : "default"}
        topBarLeft={
          <Breadcrumbs
            items={[{ label: active.title }]}
            size="sm"
            hasLighterFont
          />
        }
        topBarRight={
          <Button
            size="sm"
            variant="ghost-secondary"
            icon={Folder}
            tooltip="Files"
            label={files.length > 0 ? String(files.length) : undefined}
            onClick={() => {
              if (isFilesOpen) {
                closeSidePanels();
              } else {
                setIsFilesOpen(true);
              }
            }}
          />
        }
      >
        <ConversationView
          conversation={active}
          agents={agents}
          selectedAgent={selectedAgent}
          onSelectAgent={(agent) => setAgentId(agent.id)}
          onSend={handleSend}
          onOpenFile={openFileInPanel}
          isGrey={background === "grey-conversation"}
          subtitle={subtitle}
        />
      </PanelLayoutPanel>

      <PanelLayoutPanel
        label="Files"
        sizingType="secondary"
        isOpen={isFilesOpen}
        onClose={closeSidePanels}
        topBarLeft={
          <Breadcrumbs items={[{ label: "Files" }]} size="sm" hasLighterFont />
        }
      >
        <ConversationFilesPanel
          files={files.map(toDataSource)}
          onFileOpen={(dataSource) => {
            const file = files.find((f) => f.key === dataSource.id);
            if (file) {
              openFileInPanel(file);
            }
          }}
        />
      </PanelLayoutPanel>

      <PanelLayoutPanel
        label={openFile?.title ?? "File"}
        // A document being edited takes focus, like a page.
        sizingType="default"
        tone={background === "grey" ? "muted" : "default"}
        fullscreenEnabled
        isOpen={openFile !== null}
        onClose={() => setOpenFile(null)}
        topBarLeft={
          <Breadcrumbs
            items={[{ label: openFile?.title ?? "File" }]}
            size="sm"
            hasLighterFont
          />
        }
        topBarRight={
          <div ref={setDocToolbarSlot} className="flex items-center gap-1" />
        }
      >
        {openFile && docKey && (
          <DocumentPanel
            key={docKey}
            title={openFile.title}
            loadDocument={() => readFile(active, openFile.key)}
            agentName={selectedAgent.name}
            session={docSessions[docKey]}
            onSessionCreate={(session) =>
              setDocSessions((prev) => ({ ...prev, [docKey]: session }))
            }
            onSessionChange={(update) =>
              setDocSessions((prev) =>
                prev[docKey]
                  ? { ...prev, [docKey]: update(prev[docKey]) }
                  : prev
              )
            }
            isConversationBusy={active.isRunning}
            agentRunCount={
              active.messages.filter(
                (m) => m.role === "agent" && m.status !== "streaming"
              ).length
            }
            commentsVariant={
              commentsVariants[active.id] || defaultCommentsVariant
            }
            toolbarSlot={docToolbarSlot}
            background={background}
            commentStyle={commentStyles[active.id] || defaultCommentStyle}
            onCommentStyleChange={(style) => setCommentStyle(active.id, style)}
            onBackgroundChange={(value) => setDocBackground(active.id, value)}
            onCommentsVariantChange={(variant) =>
              setCommentsVariant(active.id, variant)
            }
            askAgent={(request) =>
              askFromComment(active, { ...request, fileKey: openFile.key })
            }
            agents={agents.map((a) => ({
              name: a.name,
              pictureUrl: a.pictureUrl,
            }))}
            fileAgents={[
              ...new Map(
                active.messages.flatMap((m) =>
                  m.role === "agent"
                    ? [
                        [
                          m.agent.name,
                          {
                            name: m.agent.name,
                            pictureUrl: m.agent.pictureUrl,
                          },
                        ],
                      ]
                    : []
                )
              ).values(),
            ]}
            findAgent={(name) => {
              const agent = agents.find(
                (a) => a.name.toLowerCase() === name.toLowerCase()
              );
              return agent
                ? { name: agent.name, pictureUrl: agent.pictureUrl }
                : null;
            }}
          />
        )}
      </PanelLayoutPanel>
    </PanelLayout>
  );
}
