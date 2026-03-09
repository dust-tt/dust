import {
  ArrowLeftIcon,
  Button,
  ChatBubbleLeftRightIcon,
  NavigationList,
  NavigationListItem,
  SidebarLayout,
  type SidebarLayoutRef,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConversationView } from "../components/ConversationView";
import {
  createConversationsWithMessages,
  mockAgents,
  mockUsers,
  type User,
} from "../data";

export default function PlaygroundDemo() {
  const [user, setUser] = useState<User | null>(null);
  const [conversationsWithMessages, setConversationsWithMessages] = useState<
    ReturnType<typeof createConversationsWithMessages>
  >([]);
  const sidebarLayoutRef = useRef<SidebarLayoutRef>(null);

  useEffect(() => {
    const randomUser = mockUsers[0];
    setUser(randomUser);
    const convs = createConversationsWithMessages(randomUser.id);
    setConversationsWithMessages(convs);
  }, []);

  const selectedConversation = useMemo(() => {
    if (conversationsWithMessages.length === 0) return null;
    return conversationsWithMessages[0];
  }, [conversationsWithMessages]);

  const handleBack = () => {
    window.location.hash = "";
  };

  if (!user) {
    return (
      <div className="s-flex s-min-h-screen s-items-center s-justify-center s-bg-background dark:s-bg-background-night">
        <div className="s-text-center s-text-foreground dark:s-text-foreground-night">
          Loading...
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="s-flex s-h-full s-flex-col s-border-r s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night">
      <div className="s-flex s-items-center s-gap-2 s-border-b s-border-border s-p-3 dark:s-border-border-night">
        <Button
          variant="ghost"
          size="sm"
          icon={ArrowLeftIcon}
          aria-label="Back to playgrounds"
          onClick={handleBack}
        />
        <span className="s-heading-md s-text-foreground dark:s-text-foreground-night">
          Playground Demo
        </span>
      </div>
      <div className="s-flex-1 s-overflow-y-auto s-p-2">
        <NavigationList>
          <NavigationListItem
            label="Conversation"
            icon={ChatBubbleLeftRightIcon}
            selected={true}
            onClick={() => {}}
          />
        </NavigationList>
      </div>
    </div>
  );

  const mainContent =
    selectedConversation && user ? (
      <ConversationView
        conversation={selectedConversation}
        locutor={user}
        users={mockUsers}
        agents={mockAgents}
        conversationsWithMessages={conversationsWithMessages}
        showBackButton={false}
        conversationTitle={selectedConversation.title}
        projectTitle="Demo"
      />
    ) : (
      <div className="s-flex s-h-full s-w-full s-items-center s-justify-center s-bg-background dark:s-bg-background-night">
        <div className="s-text-muted-foreground dark:s-text-muted-foreground-night">
          No conversation to display.
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
      />
    </div>
  );
}
