import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MoreIcon,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListLabelButton,
  PlanetIcon,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import {
  getRandomAgents,
  getRandomUsers,
  mockConversations,
  type Agent,
  type User,
} from "../data";

function DustMain() {
  const [activeTab, setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "chat"
  );
  const [searchText, setSearchText] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const randomUser = getRandomUsers(1)[0];
    setUser(randomUser);

    // Generate random number of agents between 2 and 8
    const agentCount = Math.floor(Math.random() * (8 - 2 + 1)) + 2;
    const randomAgents = getRandomAgents(agentCount);
    setAgents(randomAgents);
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
        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as "chat" | "spaces" | "admin")
          }
          className="s-flex s-flex-1 s-flex-col s-overflow-hidden"
        >
          <TabsList className="s-mt-2 s-px-2">
            <TabsTrigger
              value="chat"
              label="Chat"
              icon={ChatBubbleLeftRightIcon}
            />
            <TabsTrigger value="spaces" label="Spaces" icon={PlanetIcon} />
            <TabsTrigger value="admin" icon={Cog6ToothIcon} />
          </TabsList>

          {/* Chat Tab */}
          <TabsContent
            value="chat"
            className="s-flex s-flex-1 s-flex-col s-overflow-hidden"
          >
            {/* Search Bar */}
            <div className="s-flex s-gap-2 s-p-2">
              <SearchInput
                name="conversation-search"
                value={searchText}
                onChange={setSearchText}
                placeholder="Search conversations..."
                className="s-flex-1"
              />
              <Button label="New" variant="primary" size="sm" />
            </div>

            {/* Collapsible Sections */}
            <NavigationList className="s-px-2">
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
                <></>
              </NavigationListCollapsibleSection>

              <NavigationListCollapsibleSection
                label="Agents"
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
          </TabsContent>

          {/* Spaces Tab */}
          <TabsContent
            value="spaces"
            className="s-flex s-flex-1 s-flex-col s-overflow-hidden"
          >
            <div className="s-flex s-flex-1 s-items-center s-justify-center">
              <p className="s-text-muted-foreground dark:s-text-muted-foreground-night">
                Spaces coming soon
              </p>
            </div>
          </TabsContent>

          {/* Admin Tab */}
          <TabsContent
            value="admin"
            className="s-flex s-flex-1 s-flex-col s-overflow-hidden"
          >
            <div className="s-flex s-flex-1 s-items-center s-justify-center">
              <p className="s-text-muted-foreground dark:s-text-muted-foreground-night">
                Admin coming soon
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Bottom Bar */}
        <div className="s-flex s-items-center s-gap-2 s-border-t s-border-border s-p-3 dark:s-border-border-night">
          <Avatar
            name={user.fullName}
            visual={user.portrait}
            size="sm"
            isRounded={true}
          />
          <p className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
            {user.fullName}
          </p>
        </div>
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
