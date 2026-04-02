import "@dust-tt/sparkle/styles/allotment.css";

import {
  Avatar,
  BarChartIcon,
  BoltIcon,
  BoltOffIcon,
  BookOpenIcon,
  BracesIcon,
  BrainIcon,
  Button,
  Card,
  CardIcon,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  CompanyIcon,
  ContactsUserIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  HeartIcon,
  LightbulbIcon,
  ListSelectIcon,
  LockIcon,
  LogoutIcon,
  MoreIcon,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListCompactLabel,
  NavigationListItem,
  NavigationListItemAction,
  NavigationListLabel,
  PencilSquareIcon,
  PlanetIcon,
  PlusIcon,
  ScrollArea,
  ScrollBar,
  SearchInput,
  ShapesIcon,
  SidebarLayout,
  type SidebarLayoutRef,
  SidebarLeftCloseIcon,
  SidebarLeftOpenIcon,
  SlackLogo,
  SpaceClosedIcon,
  SpaceOpenIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrashIcon,
  UserIcon,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConversationView } from "../components/ConversationView";
import { InputBar } from "../components/InputBar";
import {
  type Agent,
  type Conversation,
  createConversationsWithMessages,
  getRandomSpaces,
  getRandomUsers,
  mockAgents,
  mockConversations,
  mockUsers,
  type Space,
  type User,
} from "../data";

function InputBarUpdateMain() {
  const [activeTab, setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "chat"
  );
  const [searchText, setSearchText] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >("new-conversation");
  const [conversationsWithMessages, setConversationsWithMessages] = useState<
    Conversation[]
  >([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [adminSelectedId, setAdminSelectedId] = useState<string | null>(
    "members"
  );
  const sidebarLayoutRef = useRef<SidebarLayoutRef>(null);

  useEffect(() => {
    const randomUser = getRandomUsers(1)[0];
    setUser(randomUser);
    setSpaces(getRandomSpaces(5));
    setConversationsWithMessages(
      createConversationsWithMessages(randomUser.id)
    );
  }, []);

  const allConversations = useMemo(
    () => [...conversationsWithMessages, ...mockConversations],
    [conversationsWithMessages]
  );

  const filteredConversations = useMemo(() => {
    if (!searchText.trim()) return allConversations;
    const lower = searchText.toLowerCase();
    return allConversations.filter((c) =>
      c.title.toLowerCase().includes(lower)
    );
  }, [searchText, allConversations]);

  const groupedConversations = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setDate(lastMonth.getDate() - 30);

    const groups = {
      today: [] as Conversation[],
      yesterday: [] as Conversation[],
      lastWeek: [] as Conversation[],
      lastMonth: [] as Conversation[],
    };

    filteredConversations.forEach((conv) => {
      if (conv.updatedAt >= today) groups.today.push(conv);
      else if (conv.updatedAt >= yesterday) groups.yesterday.push(conv);
      else if (conv.updatedAt >= lastWeek) groups.lastWeek.push(conv);
      else if (conv.updatedAt >= lastMonth) groups.lastMonth.push(conv);
    });

    return groups;
  }, [filteredConversations]);

  const selectedConversation = useMemo(
    () => allConversations.find((c) => c.id === selectedConversationId) || null,
    [selectedConversationId, allConversations]
  );

  const inboxConversations = useMemo(() => {
    if (filteredConversations.length === 0) return [];
    const count = Math.floor(Math.random() * 4) + 2;
    const shuffled = [...filteredConversations].sort(() => 0.5 - Math.random());
    return shuffled
      .slice(0, Math.min(count, filteredConversations.length))
      .map((conversation) => ({
        conversation,
        status: (Math.random() < 0.25 ? "blocked" : "idle") as
          | "idle"
          | "blocked",
      }));
  }, [filteredConversations]);

  const getConversationMoreMenu = (conversation: Conversation) => (
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

  if (!user) {
    return (
      <div className="s-flex s-min-h-screen s-items-center s-justify-center s-bg-background dark:s-bg-background-night">
        <p className="s-text-foreground dark:s-text-foreground-night">
          Loading...
        </p>
      </div>
    );
  }

  // ── Sidebar content ──────────────────────────────────────────────────
  const sidebarContent = (
    <div className="s-flex s-h-full s-flex-col s-border-r s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "chat" | "spaces" | "admin")}
        className="s-flex s-min-h-0 s-flex-1 s-flex-col"
      >
        <TabsList className="s-mt-3 s-px-2">
          <TabsTrigger
            value="chat"
            label="Chat"
            icon={ChatBubbleLeftRightIcon}
          />
          <TabsTrigger value="spaces" label="Spaces" icon={PlanetIcon} />
          <TabsTrigger value="admin" icon={Cog6ToothIcon} />
        </TabsList>

        {/* ── Chat tab ─────────────────────────────────────────────── */}
        <TabsContent
          value="chat"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <ScrollArea className="s-flex-1">
            <ScrollBar orientation="vertical" size="minimal" />
            {/* Search bar */}
            <div className="s-flex s-gap-2 s-p-2 s-px-2">
              <SearchInput
                name="conversation-search"
                value={searchText}
                onChange={setSearchText}
                placeholder="Search"
                className="s-flex-1"
              />
              <Button
                variant="primary"
                tooltip="New Conversation"
                size="sm"
                icon={ChatBubbleBottomCenterTextIcon}
                label="New"
                onClick={() => setSelectedConversationId("new-conversation")}
              />
            </div>

            {/* Inbox */}
            {inboxConversations.length > 0 && (
              <NavigationListCollapsibleSection
                label="Inbox"
                className="s-border-b s-border-t s-border-border dark:s-border-border-night s-bg-background/50 s-px-2 s-pb-2 dark:s-bg-background-night/50"
                actionOnHover={false}
              >
                {inboxConversations.map(({ conversation, status }) => (
                  <NavigationListItem
                    key={conversation.id}
                    label={conversation.title}
                    selected={conversation.id === selectedConversationId}
                    status={status}
                    moreMenu={getConversationMoreMenu(conversation)}
                    onClick={() => setSelectedConversationId(conversation.id)}
                  />
                ))}
              </NavigationListCollapsibleSection>
            )}

            {/* Conversations grouped by date */}
            <NavigationList className="s-px-2">
              {filteredConversations.length > 0 && (
                <NavigationListCollapsibleSection
                  label="Conversations"
                  defaultOpen={true}
                  action={
                    <>
                      <Button
                        size="xmini"
                        icon={ChatBubbleLeftRightIcon}
                        variant="ghost"
                        aria-label="New Conversation"
                        tooltip="New Conversation"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="xmini"
                            icon={MoreIcon}
                            variant="ghost"
                            aria-label="Conversations options"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel label="Conversations" />
                          <DropdownMenuItem
                            label="Hide triggered"
                            icon={BoltOffIcon}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                          <DropdownMenuItem
                            label="Edit history"
                            icon={ListSelectIcon}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                          <DropdownMenuItem
                            label="Clear history"
                            variant="warning"
                            icon={TrashIcon}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  }
                >
                  {groupedConversations.today.length > 0 &&
                    groupedConversations.today.map((c) => (
                      <NavigationListItem
                        key={c.id}
                        label={c.title}
                        selected={c.id === selectedConversationId}
                        moreMenu={getConversationMoreMenu(c)}
                        onClick={() => setSelectedConversationId(c.id)}
                      />
                    ))}
                  {groupedConversations.yesterday.length > 0 && (
                    <>
                      <NavigationListCompactLabel label="Yesterday" isSticky />
                      {groupedConversations.yesterday.map((c) => (
                        <NavigationListItem
                          key={c.id}
                          label={c.title}
                          selected={c.id === selectedConversationId}
                          moreMenu={getConversationMoreMenu(c)}
                          onClick={() => setSelectedConversationId(c.id)}
                        />
                      ))}
                    </>
                  )}
                  {groupedConversations.lastWeek.length > 0 && (
                    <>
                      <NavigationListCompactLabel label="Last week" isSticky />
                      {groupedConversations.lastWeek.map((c) => (
                        <NavigationListItem
                          key={c.id}
                          label={c.title}
                          selected={c.id === selectedConversationId}
                          moreMenu={getConversationMoreMenu(c)}
                          onClick={() => setSelectedConversationId(c.id)}
                        />
                      ))}
                    </>
                  )}
                  {groupedConversations.lastMonth.length > 0 && (
                    <>
                      <NavigationListCompactLabel label="Last month" />
                      {groupedConversations.lastMonth.map((c) => (
                        <NavigationListItem
                          key={c.id}
                          label={c.title}
                          selected={c.id === selectedConversationId}
                          moreMenu={getConversationMoreMenu(c)}
                          onClick={() => setSelectedConversationId(c.id)}
                        />
                      ))}
                    </>
                  )}
                </NavigationListCollapsibleSection>
              )}
            </NavigationList>
          </ScrollArea>
        </TabsContent>

        {/* ── Spaces tab ───────────────────────────────────────────── */}
        <TabsContent
          value="spaces"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <ScrollArea className="s-flex-1">
            <ScrollBar orientation="vertical" size="minimal" />
            <NavigationList className="s-px-2 s-pt-2">
              {spaces.map((space) => {
                const isRestricted =
                  space.id.charCodeAt(space.id.length - 1) % 2 === 0;
                return (
                  <NavigationListItem
                    key={space.id}
                    label={space.name}
                    icon={isRestricted ? SpaceClosedIcon : SpaceOpenIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                );
              })}
            </NavigationList>
          </ScrollArea>
        </TabsContent>

        {/* ── Admin tab (matching production sub-navigation) ───────── */}
        <TabsContent
          value="admin"
          className="s-flex s-min-h-0 s-flex-1 s-flex-col"
        >
          <ScrollArea className="s-flex-1">
            <ScrollBar orientation="vertical" size="minimal" />
            <NavigationList className="s-px-3 s-pt-2">
              {/* Workspace section */}
              <NavigationListLabel label="Workspace" variant="primary" />
              <NavigationListItem
                label="People & Security"
                icon={UserIcon}
                selected={adminSelectedId === "members"}
                onClick={() => setAdminSelectedId("members")}
              />
              <NavigationListItem
                label="Workspace Settings"
                icon={CompanyIcon}
                selected={adminSelectedId === "workspace"}
                onClick={() => setAdminSelectedId("workspace")}
              />
              <NavigationListItem
                label="Model Providers"
                icon={BrainIcon}
                selected={adminSelectedId === "model_providers"}
                onClick={() => setAdminSelectedId("model_providers")}
              />
              <NavigationListItem
                label="Analytics"
                icon={BarChartIcon}
                selected={adminSelectedId === "analytics"}
                onClick={() => setAdminSelectedId("analytics")}
              />
              <NavigationListItem
                label="Subscription"
                icon={CardIcon}
                selected={adminSelectedId === "subscription"}
                onClick={() => setAdminSelectedId("subscription")}
              />

              {/* API & Programmatic section */}
              <NavigationListLabel
                label="API & Programmatic"
                variant="primary"
              />
              <NavigationListItem
                label="API Keys"
                icon={LockIcon}
                selected={adminSelectedId === "api_keys"}
                onClick={() => setAdminSelectedId("api_keys")}
              />
              <NavigationListItem
                label="Programmatic Usage"
                icon={BoltIcon}
                selected={adminSelectedId === "credits_usage"}
                onClick={() => setAdminSelectedId("credits_usage")}
              />

              {/* Builder Tools section */}
              <NavigationListLabel label="Builder Tools" variant="primary" />
              <NavigationListItem
                label="App Credentials"
                icon={ShapesIcon}
                selected={adminSelectedId === "providers"}
                onClick={() => setAdminSelectedId("providers")}
              />
              <NavigationListItem
                label="Secrets"
                icon={BracesIcon}
                selected={adminSelectedId === "dev_secrets"}
                onClick={() => setAdminSelectedId("dev_secrets")}
              />
            </NavigationList>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* ── Footer: User menu + help ───────────────────────────────── */}
      <div className="s-flex s-h-14 s-items-center s-justify-between s-gap-2 s-border-t s-border-border s-pl-1 s-pr-2 dark:s-border-border-night">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Card
              size="xs"
              onClick={(e) => e.preventDefault()}
              className="s-p-1"
              containerClassName="s-flex-1 s-min-w-0"
            >
              <div className="s-flex s-min-w-0 s-items-center s-gap-2 s-pr-1">
                <Avatar
                  name={user.fullName}
                  visual={user.portrait}
                  size="sm"
                  isRounded={true}
                />
                <div className="s-flex s-min-w-0 s-grow s-flex-col s-text-sm s-text-foreground dark:s-text-foreground-night">
                  <span className="s-heading-sm s-min-w-0 s-overflow-hidden s-text-ellipsis s-whitespace-nowrap">
                    {user.fullName}
                  </span>
                  <span className="-s-mt-0.5 s-min-w-0 s-overflow-hidden s-text-ellipsis s-whitespace-nowrap s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                    ACME
                  </span>
                </div>
              </div>
            </Card>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="Profile"
              icon={UserIcon}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
            <DropdownMenuItem
              label="Administration"
              icon={Cog6ToothIcon}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger icon={HeartIcon} label="Help & Support" />
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel label="Learn about Dust" />
                  <DropdownMenuItem
                    label="Quickstart Guide"
                    icon={LightbulbIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="Guides & Documentation"
                    icon={BookOpenIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuItem
                    label="Join the Slack Community"
                    icon={SlackLogo}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                  <DropdownMenuLabel label="Ask questions" />
                  <DropdownMenuItem
                    label="Ask @help"
                    description="Ask anything about Dust"
                    icon={ChatBubbleLeftRightIcon}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              label="Signout"
              icon={LogoutIcon}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost-secondary"
          size="icon"
          icon={isSidebarCollapsed ? SidebarLeftOpenIcon : SidebarLeftCloseIcon}
          onClick={() => sidebarLayoutRef.current?.toggle()}
        />
      </div>
    </div>
  );

  // ── Main content ─────────────────────────────────────────────────────
  const mainContent =
    selectedConversationId &&
    selectedConversationId !== "new-conversation" &&
    selectedConversation &&
    user ? (
      <ConversationView
        conversation={selectedConversation}
        locutor={user}
        users={mockUsers}
        agents={mockAgents}
        conversationsWithMessages={conversationsWithMessages}
      />
    ) : (
      // Welcome / new conversation view
      <div className="s-flex s-h-full s-w-full s-items-center s-justify-center s-bg-background dark:s-bg-background-night">
        <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6 s-px-4 s-py-8">
          <div className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
            Welcome, {user.fullName.split(" ")[0]}!
          </div>
          <InputBar placeholder="Ask a question" />
          <div className="s-flex s-w-full s-flex-col s-gap-3">
            <div className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
              Chat with&hellip;
            </div>
            <div className="s-flex s-flex-wrap s-gap-2">
              {mockAgents.slice(0, 6).map((agent) => (
                <Button
                  key={agent.id}
                  variant="outline"
                  size="sm"
                  label={`${agent.emoji} ${agent.name}`}
                  onClick={() => {}}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div className="s-flex s-h-screen s-w-full s-bg-background dark:s-bg-background-night">
      <SidebarLayout
        ref={sidebarLayoutRef}
        sidebar={sidebarContent}
        content={mainContent}
        defaultSidebarWidth={280}
        minSidebarWidth={200}
        maxSidebarWidth={400}
        collapsible={true}
        onSidebarToggle={setIsSidebarCollapsed}
      />
    </div>
  );
}

export default function InputBarUpdate() {
  return <InputBarUpdateMain />;
}
