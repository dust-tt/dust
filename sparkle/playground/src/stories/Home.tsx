import "@dust-tt/sparkle/styles/allotment.css";

import {
  ArrowDownIcon,
  DustLogoSquareGray,
  AssistantCard,
  AssistantCardMore,
  Avatar,
  Button,
  CardGrid,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  CheckDoubleIcon,
  Cog6ToothIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LogoutIcon,
  MoreIcon,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListCompactLabel,
  NavigationListItem,
  NavigationListItemAction,
  Page,
  PencilSquareIcon,
  PlanetIcon,
  PlusIcon,
  RobotIcon,
  ScrollArea,
  ScrollBar,
  SearchInput,
  SidebarLayout,
  type SidebarLayoutRef,
  SpaceOpenIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrashIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useRef, useState } from "react";

import { ConversationView } from "../components/ConversationView";
import { InputBar, type PillAgent } from "../components/InputBar";
import {
  type Agent,
  type Conversation,
  type Space,
  type User,
  getAgentById,
  mockAgents,
  mockConversations,
  mockSpaces,
  mockUsers,
} from "../data";

// ── Fake data ─────────────────────────────────────────────────────────────────

const CURRENT_USER: User = mockUsers[0];

const AGENT_TAGS = [
  { id: "most_popular", name: "Most popular" },
  { id: "engineering", name: "Engineering" },
  { id: "sales", name: "Sales & Support" },
  { id: "others", name: "Others" },
];

const AGENT_TAG_MAP: Record<string, string[]> = {
  most_popular: [
    "agent-1",
    "agent-5",
    "agent-7",
    "agent-11",
    "agent-12",
    "agent-14",
  ],
  engineering: ["agent-2", "agent-6", "agent-8", "agent-3"],
  sales: ["agent-4", "agent-9", "agent-10", "agent-13"],
  others: ["agent-15", "agent-16", "agent-17", "agent-18"],
};

const SPACES: Space[] = mockSpaces.slice(0, 8);

function buildConversations(): Conversation[] {
  const now = new Date();
  return mockConversations.slice(0, 25).map((c, i) => ({
    ...c,
    updatedAt: new Date(
      now.getTime() - i * (i < 3 ? 3600000 : i < 8 ? 86400000 : 86400000 * i)
    ),
  }));
}

const ALL_CONVERSATIONS = buildConversations();

// A few inbox items (first 3 conversations with statuses).
const INBOX_ITEMS = ALL_CONVERSATIONS.slice(0, 3).map((c, i) => ({
  conversation: c,
  status: (["unread", "blocked", "idle"] as const)[i % 3],
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByDate(conversations: Conversation[]) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(now);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(now);
  lastMonth.setDate(lastMonth.getDate() - 30);

  const groups = {
    today: [] as Conversation[],
    yesterday: [] as Conversation[],
    lastWeek: [] as Conversation[],
    lastMonth: [] as Conversation[],
    older: [] as Conversation[],
  };

  conversations.forEach((c) => {
    const d = c.updatedAt;
    if (d >= now) groups.today.push(c);
    else if (d >= yesterday) groups.yesterday.push(c);
    else if (d >= lastWeek) groups.lastWeek.push(c);
    else if (d >= lastMonth) groups.lastMonth.push(c);
    else groups.older.push(c);
  });

  return groups;
}

function getAgentPictureUrl(agent: Agent): string {
  // Generate a deterministic placeholder picture URL from the agent's emoji.
  return `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(agent.name)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

function DustHome() {
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [searchText, setSearchText] = useState("");
  const [agentTab, setAgentTab] = useState("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortLabel] = useState("By popularity");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingAgent, setThinkingAgent] = useState<PillAgent | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<PillAgent | null>(null);
  const [chatMessages, setChatMessages] = useState<
    {
      role: "user" | "assistant";
      content: string;
      agent?: { name: string; emoji: string; backgroundColor: string };
    }[]
  >([]);
  const sidebarRef = useRef<SidebarLayoutRef>(null);

  const user = CURRENT_USER;

  const handleSend = useCallback((message: string, agent: PillAgent | null) => {
    // Add user message
    setChatMessages((prev) => [...prev, { role: "user", content: message }]);

    const respondingAgent = agent ?? {
      id: "dust",
      name: "@dust",
      emoji: "✨",
      backgroundColor: "s-bg-rose-100",
    };
    setThinkingAgent(respondingAgent);
    setIsThinking(true);

    // Simulate a really long thinking (8 seconds)
    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I've analyzed your request carefully. Here's what I found after thorough consideration of all the relevant factors and data points available to me. Let me walk you through my reasoning step by step to ensure complete transparency in how I arrived at this conclusion.",
          agent: respondingAgent,
        },
      ]);
      setIsThinking(false);
      setThinkingAgent(null);
    }, 8000);
  }, []);

  // Filter conversations by search.
  const filteredConversations = useMemo(() => {
    if (!searchText.trim()) return ALL_CONVERSATIONS;
    const lower = searchText.toLowerCase();
    return ALL_CONVERSATIONS.filter((c) =>
      c.title.toLowerCase().includes(lower)
    );
  }, [searchText]);

  const grouped = useMemo(
    () => groupByDate(filteredConversations),
    [filteredConversations]
  );

  const selectedConversation = useMemo(
    () =>
      ALL_CONVERSATIONS.find((c) => c.id === selectedConversationId) ?? null,
    [selectedConversationId]
  );

  // Agents for the current tab / tag.
  const displayedAgents = useMemo(() => {
    if (agentTab === "all") {
      if (selectedTag) {
        const ids = AGENT_TAG_MAP[selectedTag] ?? [];
        return ids.map((id) => getAgentById(id)).filter(Boolean) as Agent[];
      }
      return mockAgents.slice(0, 18);
    }
    if (agentTab === "favorites") {
      return mockAgents.slice(0, 6);
    }
    // editable_by_me
    return mockAgents.slice(4, 10);
  }, [agentTab, selectedTag]);

  // ── Sidebar ─────────────────────────────────────────────────────────────

  const conversationMoreMenu = (conv: Conversation) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <NavigationListItemAction />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          label="Rename"
          icon={PencilSquareIcon}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        <DropdownMenuItem
          label="Delete"
          icon={TrashIcon}
          variant="warning"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderConversationItem = (conv: Conversation) => (
    <NavigationListItem
      key={conv.id}
      label={conv.title}
      selected={conv.id === selectedConversationId}
      moreMenu={conversationMoreMenu(conv)}
      onClick={() => setSelectedConversationId(conv.id)}
    />
  );

  const sidebarContent = (
    <div className="s-flex s-min-w-0 s-grow s-flex-col s-bg-muted-background dark:s-bg-muted-background-night">
      {/* ── Navigation tabs ── */}
      <Tabs
        defaultValue="conversations"
        className="s-flex s-min-h-0 s-flex-1 s-flex-col"
      >
        <div className="s-border-b s-border-separator s-px-2 dark:s-border-separator-night">
          <TabsList>
            <TabsTrigger
              value="conversations"
              label="Chat"
              icon={ChatBubbleLeftRightIcon}
            />
            <TabsTrigger value="spaces" label="Spaces" icon={PlanetIcon} />
            <TabsTrigger value="admin" icon={Cog6ToothIcon} />
          </TabsList>
        </div>

        {/* ── Chat tab content ── */}
        <TabsContent
          value="conversations"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          {/* Search + New */}
          <div className="s-z-50 s-flex s-justify-end s-gap-2 s-p-2">
            <SearchInput
              name="conv-search"
              value={searchText}
              onChange={setSearchText}
              placeholder="Search"
              className="s-flex-1"
            />
            <Button
              variant="primary"
              size="sm"
              icon={ChatBubbleBottomCenterTextIcon}
              label="New"
              onClick={() => setSelectedConversationId(null)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" icon={MoreIcon} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel label="Agents" />
                <DropdownMenuItem
                  icon={PlusIcon}
                  label="Build an agent"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                />
                <DropdownMenuItem
                  icon={RobotIcon}
                  label="Manage agents"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Conversation list */}
          <div className="s-h-full s-w-full s-overflow-y-auto">
            {/* Inbox section */}
            {INBOX_ITEMS.length > 0 && (
              <NavigationListCollapsibleSection
                label={`Inbox (${INBOX_ITEMS.length})`}
                className="s-border-b s-border-t s-border-border s-bg-background/50 s-px-2 s-pb-2 dark:s-border-border-night dark:s-bg-background-night/50"
                defaultOpen
                action={
                  <Button
                    size="mini"
                    variant="ghost"
                    icon={CheckDoubleIcon}
                    tooltip="Mark all as read"
                  />
                }
              >
                {INBOX_ITEMS.map(({ conversation, status }) => (
                  <NavigationListItem
                    key={conversation.id}
                    label={conversation.title}
                    selected={conversation.id === selectedConversationId}
                    status={
                      status === "unread"
                        ? undefined
                        : status === "blocked"
                          ? "blocked"
                          : "idle"
                    }
                    moreMenu={conversationMoreMenu(conversation)}
                    onClick={() => setSelectedConversationId(conversation.id)}
                  />
                ))}
              </NavigationListCollapsibleSection>
            )}

            {/* Conversations by date */}
            <NavigationList className="s-px-2">
              <NavigationListCollapsibleSection
                label="Conversations"
                defaultOpen
              >
                {/* Today – no sticky label for first group */}
                {grouped.today.map(renderConversationItem)}

                {grouped.yesterday.length > 0 && (
                  <>
                    <NavigationListCompactLabel label="Yesterday" isSticky />
                    {grouped.yesterday.map(renderConversationItem)}
                  </>
                )}
                {grouped.lastWeek.length > 0 && (
                  <>
                    <NavigationListCompactLabel label="Last week" isSticky />
                    {grouped.lastWeek.map(renderConversationItem)}
                  </>
                )}
                {grouped.lastMonth.length > 0 && (
                  <>
                    <NavigationListCompactLabel label="Last month" isSticky />
                    {grouped.lastMonth.map(renderConversationItem)}
                  </>
                )}
                {grouped.older.length > 0 && (
                  <>
                    <NavigationListCompactLabel label="Older" isSticky />
                    {grouped.older.map(renderConversationItem)}
                  </>
                )}

                {filteredConversations.length === 0 && (
                  <div className="s-flex s-h-20 s-items-center s-justify-center s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                    No conversations found
                  </div>
                )}
              </NavigationListCollapsibleSection>
            </NavigationList>
          </div>
        </TabsContent>

        {/* ── Spaces tab content ── */}
        <TabsContent
          value="spaces"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <NavigationList className="s-px-3">
            {SPACES.map((space) => (
              <NavigationListItem
                key={space.id}
                label={space.name}
                icon={SpaceOpenIcon}
              />
            ))}
          </NavigationList>
        </TabsContent>

        {/* ── Admin tab content ── */}
        <TabsContent
          value="admin"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <NavigationList className="s-px-3">
            <NavigationListItem label="Members" icon={UserIcon} />
            <NavigationListItem label="Plans & billing" icon={Cog6ToothIcon} />
          </NavigationList>
        </TabsContent>
      </Tabs>

      {/* ── User footer ── */}
      <div className="s-flex s-items-center s-border-t s-px-2 s-py-2 s-border-border-dark dark:s-border-border-dark-night s-text-foreground dark:s-text-foreground-night">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="s-flex s-min-w-0 s-items-center s-gap-2 s-rounded-md s-px-1 s-py-1 hover:s-bg-muted-background-hover dark:hover:s-bg-muted-background-hover-night">
              <Avatar
                size="xs"
                name={user.fullName}
                visual={user.portrait}
                isRounded
              />
              <span className="s-heading-sm s-truncate">{user.fullName}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel label={user.fullName} />
            <DropdownMenuSeparator />
            <DropdownMenuItem label="Profile" icon={UserIcon} />
            <DropdownMenuItem label="Settings" icon={Cog6ToothIcon} />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              label="Sign out"
              icon={LogoutIcon}
              variant="warning"
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="s-flex-1" />
        <Button
          variant="ghost-secondary"
          size="icon"
          icon={MoreIcon}
          tooltip="Help & feedback"
        />
      </div>
    </div>
  );

  // ── Main content ────────────────────────────────────────────────────────

  const agentSectionRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToAgents = useCallback(() => {
    agentSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const newConversationContent = (
    <div
      ref={scrollContainerRef}
      className="s-h-full s-overflow-y-auto s-scroll-smooth s-snap-y s-snap-mandatory"
    >
      {/* ── Page 1: Hero – centered greeting + input ── */}
      <div
        className="s-relative s-flex s-h-full s-min-h-full s-snap-start s-snap-always s-flex-col s-items-center s-px-4 md:s-px-8"
        style={{ backgroundColor: "#FDFDFD" }}
      >
        {/* Logo at top third */}
        <div className="s-absolute s-top-[20%] s-left-1/2 -s-translate-x-1/2">
          <DustLogoSquareGray className="s-h-16 s-w-16 s-opacity-40" />
        </div>
        {/* Input centered vertically */}
        <div className="s-flex s-flex-1 s-w-full s-items-center s-justify-center">
          <div className="s-flex s-w-full s-max-w-3xl s-flex-col s-gap-8">
            <Page.Header title={`Konichiwa, ${user.firstName}!`} />
            <div className="s-w-full s-rounded-3xl s-bg-white s-shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
              <InputBar
                placeholder="Ask a question"
                className="!s-bg-transparent !s-shadow-none"
                onSend={handleSend}
                isThinking={isThinking}
                thinkingAgent={thinkingAgent}
                selectedAgent={selectedAgent}
                onAgentChange={setSelectedAgent}
              />
            </div>
          </div>
        </div>

        {/* Down arrow – bottom center */}
        <div className="s-absolute s-bottom-6 s-left-1/2 -s-translate-x-1/2">
          <button
            onClick={scrollToAgents}
            className="s-flex s-h-10 s-w-10 s-items-center s-justify-center s-rounded-full s-border s-border-border s-bg-background s-text-muted-foreground s-shadow-sm s-transition-all hover:s-bg-muted-background hover:s-text-foreground dark:s-border-border-night dark:s-bg-background-night dark:s-text-muted-foreground-night dark:hover:s-bg-muted-background-night dark:hover:s-text-foreground-night s-animate-bounce"
          >
            <ArrowDownIcon className="s-h-5 s-w-5" />
          </button>
        </div>
      </div>

      {/* ── Page 2: Agent browser – below the fold ── */}
      <div
        ref={agentSectionRef}
        className="s-flex s-min-h-full s-snap-start s-snap-always s-flex-col s-items-center s-px-4 s-py-8 md:s-px-8"
      >
        <div className="s-flex s-w-full s-max-w-3xl s-flex-col s-gap-4">
          <Page.SectionHeader title="Chat with..." />

          {/* Search + Create + Sort */}
          <div className="s-flex s-w-full s-flex-row s-items-center s-gap-2">
            <SearchInput
              name="agent-search"
              placeholder="Search agents..."
              value=""
              onChange={() => {}}
              className="s-flex-1"
            />
            <Button
              variant="primary"
              icon={PlusIcon}
              label="Create"
              size="sm"
            />
            <Button
              variant="primary"
              icon={RobotIcon}
              label="Manage agents"
              size="sm"
            />
          </div>

          {/* Agent tabs */}
          <div className="s-w-full">
            <ScrollArea>
              <Tabs
                value={agentTab}
                onValueChange={(v) => {
                  setAgentTab(v);
                  setSelectedTag(null);
                }}
              >
                <TabsList>
                  <TabsTrigger value="favorites" label="Favorites" />
                  <TabsTrigger value="all" label="All agents" />
                  <TabsTrigger value="editable_by_me" label="Editable by me" />
                  <div className="s-ml-auto" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        isSelect
                        variant="outline"
                        label={sortLabel}
                        size="sm"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem label="By popularity" />
                      <DropdownMenuItem label="Alphabetical" />
                      <DropdownMenuItem label="Recently updated" />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TabsList>
              </Tabs>
              <ScrollBar orientation="horizontal" className="s-hidden" />
            </ScrollArea>
          </div>

          {/* Tag filter buttons (shown on "All agents" tab) */}
          {agentTab === "all" && (
            <div className="s-flex s-flex-wrap s-items-center s-gap-2">
              {AGENT_TAGS.map((tag) => (
                <Button
                  key={tag.id}
                  size="xs"
                  variant={selectedTag === tag.id ? "primary" : "outline"}
                  label={tag.name}
                  onClick={() =>
                    setSelectedTag(selectedTag === tag.id ? null : tag.id)
                  }
                />
              ))}
            </div>
          )}

          {/* Agent grid */}
          <CardGrid>
            {displayedAgents.map((agent) => (
              <AssistantCard
                key={agent.id}
                title={agent.name}
                pictureUrl={getAgentPictureUrl(agent)}
                subtitle="By Dust"
                description={agent.description}
                onClick={() => setSelectedConversationId(null)}
                action={
                  <AssistantCardMore
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                    }}
                  />
                }
              />
            ))}
          </CardGrid>

          {/* Bottom spacer */}
          <div className="s-h-8 s-shrink-0" />
        </div>
      </div>
    </div>
  );

  // ── Inline chat view (after sending a message from home) ─────────────
  const inlineChatContent = (
    <div className="s-flex s-h-full s-flex-col">
      {/* Messages area */}
      <div className="s-flex-1 s-overflow-y-auto s-px-4 s-py-6 md:s-px-8">
        <div className="s-mx-auto s-flex s-max-w-3xl s-flex-col s-gap-6">
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`s-flex s-gap-3 ${msg.role === "user" ? "s-justify-end" : "s-justify-start"}`}
            >
              {msg.role === "assistant" && msg.agent && (
                <div
                  className={`s-flex s-h-8 s-w-8 s-shrink-0 s-items-center s-justify-center s-rounded-full s-text-base ${msg.agent.backgroundColor}`}
                >
                  {msg.agent.emoji}
                </div>
              )}
              <div
                className={`s-max-w-[75%] s-rounded-2xl s-px-4 s-py-3 s-text-sm ${
                  msg.role === "user"
                    ? "s-bg-highlight-100 s-text-foreground dark:s-bg-highlight-100-night dark:s-text-foreground-night"
                    : "s-bg-muted-background s-text-foreground dark:s-bg-muted-background-night dark:s-text-foreground-night"
                }`}
              >
                {msg.role === "assistant" && msg.agent && (
                  <div className="s-mb-1 s-text-xs s-font-semibold s-text-muted-foreground dark:s-text-muted-foreground-night">
                    {msg.agent.name}
                  </div>
                )}
                {msg.content}
              </div>
              {msg.role === "user" && (
                <Avatar
                  size="xs"
                  name={user.fullName}
                  visual={user.portrait}
                  isRounded
                />
              )}
            </div>
          ))}

          {/* Thinking indicator */}
          {isThinking && thinkingAgent && (
            <div className="s-flex s-gap-3 s-justify-start">
              <div
                className={`s-flex s-h-8 s-w-8 s-shrink-0 s-items-center s-justify-center s-rounded-full s-text-base ${thinkingAgent.backgroundColor}`}
              >
                {thinkingAgent.emoji}
              </div>
              <div className="s-max-w-[75%] s-rounded-2xl s-bg-muted-background s-px-4 s-py-3 s-text-sm s-text-foreground dark:s-bg-muted-background-night dark:s-text-foreground-night">
                <div className="s-mb-1 s-text-xs s-font-semibold s-text-muted-foreground dark:s-text-muted-foreground-night">
                  {thinkingAgent.name}
                </div>
                <div className="s-flex s-items-center s-gap-2 s-text-muted-foreground dark:s-text-muted-foreground-night">
                  <span className="s-animate-pulse">Thinking</span>
                  <span className="s-flex s-gap-1">
                    <span
                      className="s-h-1.5 s-w-1.5 s-animate-bounce s-rounded-full s-bg-muted-foreground"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="s-h-1.5 s-w-1.5 s-animate-bounce s-rounded-full s-bg-muted-foreground"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="s-h-1.5 s-w-1.5 s-animate-bounce s-rounded-full s-bg-muted-foreground"
                      style={{ animationDelay: "300ms" }}
                    />
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input bar pinned at bottom */}
      <div className="s-border-t s-border-border s-px-4 s-py-3 dark:s-border-border-night md:s-px-8">
        <div className="s-mx-auto s-max-w-3xl">
          <div
            className="s-w-full s-rounded-3xl s-bg-white s-shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
            style={{ border: "1px solid #F0F0F0" }}
          >
            <InputBar
              placeholder="Ask a follow-up..."
              className="!s-bg-transparent !s-shadow-none"
              onSend={handleSend}
              isThinking={isThinking}
              thinkingAgent={thinkingAgent}
              selectedAgent={selectedAgent}
              onAgentChange={setSelectedAgent}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const mainContent = selectedConversation ? (
    <ConversationView
      conversation={selectedConversation}
      locutor={user}
      users={mockUsers}
      agents={mockAgents}
      conversationsWithMessages={ALL_CONVERSATIONS.filter((c) => c.messages)}
    />
  ) : chatMessages.length > 0 ? (
    inlineChatContent
  ) : (
    newConversationContent
  );

  return (
    <div className="s-flex s-h-screen s-w-full s-bg-background dark:s-bg-background-night">
      <SidebarLayout
        ref={sidebarRef}
        sidebar={sidebarContent}
        content={
          <div className="s-relative s-flex s-h-full s-w-full s-flex-1 s-flex-col s-overflow-hidden s-bg-background s-text-foreground dark:s-bg-background-night dark:s-text-foreground-night">
            {mainContent}
          </div>
        }
        defaultSidebarWidth={320}
        minSidebarWidth={260}
        maxSidebarWidth={400}
        collapsible
      />
    </div>
  );
}

export default function Home() {
  return <DustHome />;
}
