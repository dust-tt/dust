import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  NavigationList,
  NavigationListItem,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { getRandomUsers, mockConversations, type User } from "../data";

function DustMain() {
  const [activeTab, setActiveTab] = useState<"chat" | "spaces" | "admin">(
    "chat"
  );
  const [searchText, setSearchText] = useState("");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const randomUser = getRandomUsers(1)[0];
    setUser(randomUser);
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
          <TabsList className="s-px-2 s-pt-2">
            <TabsTrigger value="chat" label="Chat" />
            <TabsTrigger value="spaces" label="Spaces" />
            <TabsTrigger value="admin" label="Admin" />
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
