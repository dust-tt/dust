import { useEffect, useMemo, useState } from "react";
import {
  ActionInboxIcon,
  Avatar,
  Button,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  LockIcon,
  MoreIcon,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListLabelButton,
  PlanetIcon,
  SearchInput,
  SidebarRightOpenIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import {
  getRandomAgents,
  getRandomSpaces,
  getRandomUsers,
  mockConversations,
  type Agent,
  type Space,
  type User,
} from "../data";

function DustMain() {
  const [activeTab, setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "chat"
  );
  const [searchText, setSearchText] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);

  useEffect(() => {
    const randomUser = getRandomUsers(1)[0];
    setUser(randomUser);

    // Generate random number of agents between 2 and 8
    const agentCount = Math.floor(Math.random() * (8 - 2 + 1)) + 2;
    const randomAgents = getRandomAgents(agentCount);
    setAgents(randomAgents);

    // Generate random number of spaces between 3 and 9
    const spaceCount = Math.floor(Math.random() * (9 - 3 + 1)) + 3;
    const randomSpaces = getRandomSpaces(spaceCount);
    setSpaces(randomSpaces);
  }, []);

  const filteredConversations = useMemo(() => {
    if (!searchText.trim()) {
      return mockConversations;
    }
    const lowerSearch = searchText.toLowerCase();
    return mockConversations.filter((conv) =>
      conv.title.toLowerCase().includes(lowerSearch)
    );
  }, [searchText]);

  if (!user) {
    return (
      <div className="s-flex s-min-h-screen s-items-center s-justify-center s-bg-background">
        <div className="s-text-center">
          <p className="s-text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="s-flex s-h-screen s-w-full s-bg-background">
      {/* Sidebar */}
      <div className="s-flex s-w-[280px] s-flex-col s-border-r s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night">
        {/* Top Bar */}
        <div className="s-flex s-items-center s-justify-between s-gap-2 s-border-b s-border-border s-px-3 s-py-2 dark:s-border-border-night">
          <div className="s-flex s-items-center s-gap-2">
            <Avatar
              name={user.fullName}
              visual={user.portrait}
              size="sm"
              isRounded={true}
            />
            <div className="s-flex s-flex-col s-text-sm s-text-foreground dark:s-text-foreground-night">
              {user.fullName}
              <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                ACME
              </span>
            </div>
          </div>
          <Button
            variant="ghost-secondary"
            size="mini"
            icon={SidebarRightOpenIcon}
            onClick={() => {
              console.log("Sidebar toggle clicked");
            }}
          />
        </div>
        {/* Search Bar */}
        <div className="s-flex s-gap-2 s-p-2">
          <SearchInput
            name="conversation-search"
            value={searchText}
            onChange={setSearchText}
            placeholder="Search"
            className="s-flex-1"
          />
          <Button label="New" variant="primary" size="sm" />
        </div>

        {/* Collapsible Sections */}
        <NavigationList className="s-px-2">
          <NavigationListItem
            label="Inbox"
            icon={ActionInboxIcon}
            onClick={() => {
              console.log("Selected Inbox");
            }}
          />
          <NavigationListCollapsibleSection
            label="Spaces"
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <NavigationListLabelButton
                    icon={MoreIcon}
                    aria-label="Spaces options"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    label="Manage"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Manage Spaces");
                    }}
                  />
                  <DropdownMenuItem
                    label="Create"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Create Space");
                    }}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            {spaces.map((space) => {
              // Deterministically assign open or restricted status based on space ID
              const isRestricted =
                space.id.charCodeAt(space.id.length - 1) % 2 === 0;
              return (
                <NavigationListItem
                  key={space.id}
                  label={space.name}
                  icon={isRestricted ? LockIcon : PlanetIcon}
                  onClick={() => {
                    console.log("Selected space:", space.id);
                  }}
                />
              );
            })}
          </NavigationListCollapsibleSection>

          <NavigationListCollapsibleSection
            label="Agents & People"
            defaultOpen={agents.length <= 3}
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <NavigationListLabelButton
                    icon={MoreIcon}
                    aria-label="Agents options"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    label="Manage"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Manage Agents");
                    }}
                  />
                  <DropdownMenuItem
                    label="Create"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Create Agent");
                    }}
                  />
                  <DropdownMenuItem
                    label="Edit"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Edit Agent");
                    }}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            {agents.map((agent) => (
              <NavigationListItem
                key={agent.id}
                label={`${agent.emoji} ${agent.name}`}
                onClick={() => {
                  console.log("Selected agent:", agent.id);
                }}
              />
            ))}
          </NavigationListCollapsibleSection>

          <NavigationListCollapsibleSection
            label="Conversations"
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <NavigationListLabelButton
                    icon={MoreIcon}
                    aria-label="Conversations options"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    label="Edit"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Edit Conversations");
                    }}
                  />
                  <DropdownMenuItem
                    label="Clear history"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Clear history");
                    }}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            <></>
          </NavigationListCollapsibleSection>
        </NavigationList>

        {/* Conversation List */}
        <NavigationList className="s-flex-1 s-overflow-auto s-px-2">
          {filteredConversations.length > 0 ? (
            filteredConversations.map((conversation) => (
              <NavigationListItem
                key={conversation.id}
                label={conversation.title}
                onClick={() => {
                  // Handle conversation click
                  console.log("Selected conversation:", conversation.id);
                }}
              />
            ))
          ) : (
            <div className="s-py-4 s-text-center s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              No conversations found
            </div>
          )}
        </NavigationList>
      </div>

      {/* Main Content Area */}
      <div className="s-flex s-flex-1 s-items-center s-justify-center s-bg-background">
        <div className="s-text-center">
          <p className="s-text-lg s-text-muted-foreground dark:s-text-muted-foreground-night">
            Select a conversation to view
          </p>
        </div>
      </div>
    </div>
  );
}

export default DustMain;
