import {
  ArrowLeft,
  Breadcrumbs,
  Button,
  Chip,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Folder,
  MessageCircle01,
  Markdown,
  Settings01,
} from "@dust-tt/sparkle";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { getDataSourceIcon } from "../data/dataSources";
import type { DataSource } from "../data/types";
import {
  PUPCHI_POD_FILES,
  readPodDocument,
  replyToPodComment,
} from "../hooks/useMockConversations";
import type {
  AgentMessage,
  ChatAgent,
  ChatMessage,
  ChatFile,
  Conversation,
  Conversations,
  DocEdit,
} from "../lib/coEdition";
import { ConversationFilesPanel } from "./ConversationSidePanels";
import { type AgentActivity, DocumentPanel } from "./doc/DocumentPanel";
import { DocumentEditCard } from "./doc/DocumentEditCard";
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
import { PodPage } from "./PodPage";
import { ProductionNav, ProductionNavTabs } from "./ProductionNav";

// Dust's conversation layout (sidebar, conversation + composer, files side
// panel) with a document co-edition panel next to the conversation.

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * What the conversation's agent is doing, for the document panel: thinking,
 * then typing from its first document tool until its reply ends (the panel
 * then shows the edit being written).
 */
function conversationAgentActivity(
  conversation: Conversation
): AgentActivity | null {
  const last = conversation.messages[conversation.messages.length - 1];
  if (last?.role !== "agent" || last.status !== "streaming") {
    return null;
  }
  const isEditing = last.tools.some((t) => t.name.startsWith("documents__"));
  return { name: last.agent.name, status: isEditing ? "typing" : "thinking" };
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
  subtitle,
  renderVersionCard,
}: {
  conversation: Conversation;
  agents: ChatAgent[];
  selectedAgent: ChatAgent;
  onSelectAgent: (agent: ChatAgent) => void;
  onSend: (text: string) => void;
  onOpenFile: (file: ChatFile) => void;
  /** Under the empty conversation's heading. */
  subtitle: string;
  /** The version card of a message that edited a document, if any. */
  renderVersionCard: (message: ChatMessage) => ReactNode;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastMessageId =
    conversation.messages[conversation.messages.length - 1]?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation.messages]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
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
                    hideActions
                    isLastMessage={message.id === lastMessageId}
                  >
                    {message.content}
                  </NewConversationUserMessage>
                  {message.edit && (
                    <div className="flex w-full justify-end pt-2">
                      {renderVersionCard(message)}
                    </div>
                  )}
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
                    citations={(message.edit ? [] : message.files).map(
                      (file) => (
                        <NewCitation
                          key={file.key}
                          visual={getDataSourceIcon(toDataSource(file))}
                          label={file.title}
                          size="lg"
                          onClick={() => onOpenFile(file)}
                        />
                      )
                    )}
                  >
                    <AgentMessageBody
                      message={message}
                      onOpenFile={onOpenFile}
                    />
                    {message.edit && message.status === "done" && (
                      <div className="pt-3">{renderVersionCard(message)}</div>
                    )}
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

const fileNameOf = (path: string) => path.split("/").pop() ?? path;

const normalize = (markdown: string) => markdown.replace(/\s+/g, " ").trim();

/**
 * A markdown file of a Pod, open full page in the co-edition editor (today
 * production opens it in a dialog, FilePreviewDialog).
 */
function PodDocument({
  path,
  session,
  onSessionCreate,
  onSessionChange,
  agents,
  agentName,
  titleSlot,
  toolbarSlot,
}: {
  path: string;
  session: DocSession | undefined;
  onSessionCreate: (session: DocSession) => void;
  onSessionChange: (update: (session: DocSession) => DocSession) => void;
  agents: ChatAgent[];
  agentName: string;
  titleSlot: HTMLElement | null;
  toolbarSlot: HTMLElement | null;
}) {
  const authors = agents.map((a) => ({
    name: a.name,
    pictureUrl: a.pictureUrl,
  }));
  return (
    <DocumentPanel
      title={fileNameOf(path)}
      loadDocument={() => readPodDocument(path)}
      agentName={agentName}
      session={session}
      onSessionCreate={onSessionCreate}
      onSessionChange={onSessionChange}
      isConversationBusy={false}
      conversationAgent={null}
      agentRunCount={0}
      toolbarSlot={toolbarSlot}
      titleSlot={titleSlot}
      version={null}
      onCloseVersion={() => {}}
      onRollBack={() => {}}
      askAgent={(request) => replyToPodComment({ ...request, fileKey: path })}
      agents={authors}
      fileAgents={[]}
      findAgent={(name) =>
        authors.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? null
      }
    />
  );
}

// ── Conversations + documents ───────────────────────────────────────────────

export function AgentConversations({
  conversations: conversationsApi,
  subtitle,
  openDocumentOnLoad = false,
}: {
  conversations: Conversations;
  subtitle: string;
  /** Opens the active conversation's first document on load. */
  openDocumentOnLoad?: boolean;
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
    rollBack,
  } = conversationsApi;
  const [agentId, setAgentId] = useState<string | null>(null);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [openFile, setOpenFile] = useState<ChatFile | null>(null);
  // A Pod's page in place of the conversation, with the markdown file open
  // full page, if any.
  const [podPage, setPodPage] = useState<{
    pod: string;
    openPath: string | null;
  } | null>(null);
  const [podTitleSlot, setPodTitleSlot] = useState<HTMLDivElement | null>(null);
  const [podToolbarSlot, setPodToolbarSlot] = useState<HTMLDivElement | null>(
    null
  );
  // The agent message whose edit the document panel shows as a diff.
  const [versionMessageId, setVersionMessageId] = useState<string | null>(null);
  // A new conversation of the Pod, in place of its files.
  const [isPodChatOpen, setIsPodChatOpen] = useState(false);
  // Bumps on a roll-back: the document panel reopens on the new content.
  const [docRevision, setDocRevision] = useState(0);
  // Co-edition state per document, keyed by conversation and file.
  const [docSessions, setDocSessions] = useState<Record<string, DocSession>>(
    {}
  );
  const docKey = openFile ? `${active.id}:${openFile.key}` : null;
  // Slot in the document panel's top bar where DocumentPanel renders its
  // actions (download, prototype options).
  // Slot next to the file name for the save status.
  const [docTitleSlot, setDocTitleSlot] = useState<HTMLDivElement | null>(null);
  const [docToolbarSlot, setDocToolbarSlot] = useState<HTMLDivElement | null>(
    null
  );

  const selectedAgent =
    agents.find((a) => a.id === agentId) ??
    agents.find((a) => a.id === "dust") ??
    agents[0];
  const files = conversationFiles(active);

  // The message whose document version the panel shows.
  const versionMessage = active.messages.find(
    (m) => m.id === versionMessageId && !!m.edit
  );
  // A document's content now: as edited in its panel, else its last version.
  const currentMarkdownOf = (fileKey: string) =>
    docSessions[`${active.id}:${fileKey}`]?.markdown ??
    [...active.messages].reverse().find((m) => m.edit?.fileKey === fileKey)
      ?.edit?.after;
  const isCurrentVersion = (edit: DocEdit) => {
    const current = currentMarkdownOf(edit.fileKey);
    return (
      current !== undefined && normalize(current) === normalize(edit.after)
    );
  };

  const closeSidePanels = () => {
    setIsFilesOpen(false);
    setOpenFile(null);
    setVersionMessageId(null);
  };

  // A document gets the room it needs to be edited: the Files list closes.
  const openFileInPanel = (file: ChatFile) => {
    setIsFilesOpen(false);
    setOpenFile(file);
    setVersionMessageId(null);
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

  const openVersion = (message: ChatMessage) => {
    const file = files.find((f) => f.key === message.edit?.fileKey);
    if (file) {
      openFileInPanel(file);
      setVersionMessageId(message.id);
    }
  };

  // The version becomes the document's content: a new version, so the
  // roll-back can itself be rolled back.
  const rollBackTo = (message: ChatMessage) => {
    const edit = message.edit;
    if (!edit) {
      return;
    }
    const current = currentMarkdownOf(edit.fileKey) ?? edit.before;
    rollBack(active, edit.fileKey, edit.after, current, message.createdAt);
    const key = `${active.id}:${edit.fileKey}`;
    setDocSessions((prev) =>
      prev[key]
        ? {
            ...prev,
            [key]: {
              ...prev[key],
              markdown: edit.after,
              savedMarkdown: edit.after,
              editorJson: null,
            },
          }
        : prev
    );
    setDocRevision((r) => r + 1);
    const file = files.find((f) => f.key === edit.fileKey);
    if (file) {
      openFileInPanel(file);
    }
  };

  const renderVersionCard = (message: ChatMessage) => {
    const edit = message.edit;
    if (!edit) {
      return null;
    }
    const isCurrent = isCurrentVersion(edit);
    const by =
      message.role === "agent"
        ? `Edited by ${message.agent.name}`
        : "Rolled back by you";
    return (
      <DocumentEditCard
        title={edit.fileKey}
        subtitle={isCurrent ? `${by} · Current version` : by}
        onClick={() => openVersion(message)}
        onRollBack={isCurrent ? undefined : () => rollBackTo(message)}
      />
    );
  };

  const selectConversation = (id: string) => {
    setActiveId(id);
    setPodPage(null);
    setIsPodChatOpen(false);
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
    <ProductionNav
      conversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
        isRunning: c.isRunning,
        createdAt: c.messages[0]?.createdAt ?? new Date(),
      }))}
      activeId={podPage ? null : active.id}
      onSelect={(id) => {
        selectConversation(id);
        onNavClose();
      }}
      onNewConversation={() => {
        startNewConversation();
        setPodPage(null);
        setIsPodChatOpen(false);
        closeSidePanels();
        onNavClose();
      }}
      selectedPod={podPage?.pod ?? null}
      onSelectPod={(pod) => {
        closeSidePanels();
        setIsPodChatOpen(false);
        setPodPage({ pod, openPath: null });
        onNavClose();
      }}
    />
  );

  // In the Pod's top bar, as the Files button in a conversation's: a new
  // conversation, in place of the files (a file open stays next to it).
  const podChatButton = (
    <Button
      size="sm"
      variant="ghost-secondary"
      icon={MessageCircle01}
      tooltip="New conversation"
      onClick={() => {
        startNewConversation();
        setIsPodChatOpen(true);
      }}
    />
  );
  // A markdown file of the Pod, in the side panel.
  const podDocPath = podPage?.openPath ?? null;

  return (
    <PanelLayout collapseNavWithSidePanel>
      <PanelLayoutNav topBarLeft={<ProductionNavTabs />}>
        {renderNav}
      </PanelLayoutNav>

      {podPage ? (
        <PanelLayoutPanel
          label={isPodChatOpen ? active.title : podPage.pod}
          isOpen={true}
          onClose={() => {}}
          minimalWidth={400}
          topBarLeft={
            <div className="flex min-w-0 items-center gap-1">
              {isPodChatOpen && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={ArrowLeft}
                  tooltip="Back to files"
                  onClick={() => setIsPodChatOpen(false)}
                />
              )}
              <Breadcrumbs
                items={[
                  {
                    label: podPage.pod,
                    onClick: isPodChatOpen
                      ? () => setIsPodChatOpen(false)
                      : undefined,
                  },
                  ...(isPodChatOpen ? [{ label: active.title }] : []),
                ]}
                size="sm"
                hasLighterFont
              />
            </div>
          }
          topBarRight={isPodChatOpen ? undefined : podChatButton}
        >
          {isPodChatOpen ? (
            <ConversationView
              conversation={active}
              agents={agents}
              selectedAgent={selectedAgent}
              onSelectAgent={(agent) => setAgentId(agent.id)}
              onSend={handleSend}
              // A file of this conversation opens with it, out of the Pod.
              onOpenFile={(file) => {
                setPodPage(null);
                setIsPodChatOpen(false);
                openFileInPanel(file);
              }}
              subtitle={`New conversation in ${podPage.pod}.`}
              renderVersionCard={renderVersionCard}
            />
          ) : (
            <PodPage
              files={PUPCHI_POD_FILES}
              onOpenFile={(file) => {
                if (file.path.endsWith(".md")) {
                  setPodPage({ ...podPage, openPath: file.path });
                }
              }}
            />
          )}
        </PanelLayoutPanel>
      ) : (
        <PanelLayoutPanel
          label={active.title}
          isOpen={true}
          onClose={() => {}}
          // Never narrower than this, including when the document panel is
          // dragged wider.
          minimalWidth={400}
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
                  // In place of the document, if one is open.
                  setOpenFile(null);
                  setVersionMessageId(null);
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
            subtitle={subtitle}
            renderVersionCard={renderVersionCard}
          />
        </PanelLayoutPanel>
      )}

      {/* One side panel: the conversation's Files or the document open from
      them, or a Pod's file. Each opens in place of the other. */}
      <PanelLayoutPanel
        label={
          podDocPath
            ? fileNameOf(podDocPath)
            : isFilesOpen
              ? "Files"
              : (openFile?.title ?? "File")
        }
        // A document being edited takes focus, like a page.
        sizingType="default"
        fullscreenEnabled={!isFilesOpen}
        isOpen={!!podDocPath || isFilesOpen || openFile !== null}
        onClose={() => {
          if (podPage) {
            setPodPage({ ...podPage, openPath: null });
          }
          closeSidePanels();
        }}
        // The file's name, then its save status (Figma, Co-edition top bar).
        topBarLeft={
          podDocPath ? (
            <div className="flex min-w-0 items-center gap-3">
              <span className="min-w-16 truncate text-sm font-medium text-foreground">
                {fileNameOf(podDocPath)}
              </span>
              <div
                ref={setPodTitleSlot}
                className="flex shrink-0 items-center empty:hidden"
              />
            </div>
          ) : isFilesOpen ? (
            <Breadcrumbs
              items={[{ label: "Files" }]}
              size="sm"
              hasLighterFont
            />
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              <span className="min-w-16 truncate text-sm font-medium text-foreground">
                {openFile?.title ?? "File"}
              </span>
              <div
                ref={setDocTitleSlot}
                className="flex shrink-0 items-center empty:hidden"
              />
            </div>
          )
        }
        topBarRight={
          isFilesOpen ? undefined : podDocPath ? (
            <div ref={setPodToolbarSlot} className="flex items-center gap-1" />
          ) : (
            <div ref={setDocToolbarSlot} className="flex items-center gap-1" />
          )
        }
      >
        {podDocPath && (
          <PodDocument
            key={podDocPath}
            path={podDocPath}
            session={docSessions[`pod:${podDocPath}`]}
            onSessionCreate={(session) =>
              setDocSessions((prev) => ({
                ...prev,
                [`pod:${podDocPath}`]: session,
              }))
            }
            onSessionChange={(update) =>
              setDocSessions((prev) => {
                const key = `pod:${podDocPath}`;
                return prev[key] ? { ...prev, [key]: update(prev[key]) } : prev;
              })
            }
            agents={agents}
            agentName={selectedAgent.name}
            titleSlot={podTitleSlot}
            toolbarSlot={podToolbarSlot}
          />
        )}
        {!podDocPath && isFilesOpen && (
          <ConversationFilesPanel
            files={files.map(toDataSource)}
            onFileOpen={(dataSource) => {
              const file = files.find((f) => f.key === dataSource.id);
              if (file) {
                openFileInPanel(file);
              }
            }}
          />
        )}
        {!podDocPath && !isFilesOpen && openFile && docKey && (
          <DocumentPanel
            key={`${docKey}:${docRevision}`}
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
            conversationAgent={conversationAgentActivity(active)}
            agentRunCount={
              active.messages.filter(
                (m) => m.role === "agent" && m.status !== "streaming"
              ).length
            }
            toolbarSlot={docToolbarSlot}
            titleSlot={docTitleSlot}
            version={
              versionMessage?.edit &&
              versionMessage.edit.fileKey === openFile.key
                ? {
                    markdown: versionMessage.edit.after,
                    at: versionMessage.createdAt,
                    isCurrent: isCurrentVersion(versionMessage.edit),
                  }
                : null
            }
            onCloseVersion={() => setVersionMessageId(null)}
            onRollBack={() => versionMessage && rollBackTo(versionMessage)}
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
