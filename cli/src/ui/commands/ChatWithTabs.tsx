import type { ConversationWithoutContentType } from "@dust-tt/client";
import { Box, Text, useInput } from "ink";
import type { FC } from "react";
import React, { useCallback, useState } from "react";

import { getDustClient } from "../../utils/dustClient.js";
import { normalizeError } from "../../utils/errors.js";
import { clearTerminal } from "../../utils/terminal.js";
import { ConversationSelector } from "../components/ConversationSelector.js";
import { TabBar } from "../components/TabBar.js";
import { TabManagerProvider, useTabManager } from "../components/TabManager.js";
import Chat from "./Chat.js";

interface ChatWithTabsProps {
  sId?: string;
  agentSearch?: string;
  message?: string;
  conversationId?: string;
}

const ChatWithTabsInner: FC<ChatWithTabsProps> = (props) => {
  const {
    activeTab,
    createTab,
    closeTab,
    updateTab,
  } = useTabManager();

  const [showConversationSelector, setShowConversationSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenConversation = useCallback(async () => {
    await clearTerminal();
    setShowConversationSelector(true);
  }, []);

  const handleNewConversation = useCallback(async () => {
    await clearTerminal();
    createTab("New Chat");
  }, [createTab]);

  const handleConversationSelect = useCallback(async (conversation: ConversationWithoutContentType) => {
    setShowConversationSelector(false);
    
    try {
      // Load the full conversation content
      const dustClient = await getDustClient();
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        return;
      }
      
      const result = await dustClient.getConversation({
        conversationId: conversation.sId,
      });
      
      if (result.isErr()) {
        setError(`Failed to load conversation: ${result.error.message}`);
        return;
      }

      const title = conversation.title || `Conversation ${conversation.sId}`;
      
      // Create a new tab with the loaded conversation
      createTab(title, conversation.sId);
      
    } catch (err) {
      setError(`Failed to load conversation: ${normalizeError(err)}`);
    }
  }, [createTab]);

  const handleConversationSelectorCancel = useCallback(async () => {
    setShowConversationSelector(false);
    await clearTerminal();
  }, []);

  // Handle Ctrl+W to close tabs
  useInput((input, key) => {
    if (key.ctrl && input === "w") {
      if (activeTab) {
        closeTab(activeTab.id);
      }
    }
  });

  // Show conversation selector overlay
  if (showConversationSelector) {
    return (
      <ConversationSelector
        onSelect={handleConversationSelect}
        onCancel={handleConversationSelectorCancel}
      />
    );
  }

  // Show error state
  if (error) {
    return (
      <Box flexDirection="column" height="100%">
        <TabBar />
        <Box flexDirection="column" flexGrow={1}>
          <Box marginY={1}>
            <Box borderStyle="round" borderColor="red" padding={1}>
              <Text>{error}</Text>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  if (!activeTab) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <TabBar />
      <Chat
        key={activeTab.id}
        sId={props.sId}
        agentSearch={props.agentSearch}
        message={props.message}
        conversationId={activeTab.conversationId || props.conversationId}
        onOpenConversation={handleOpenConversation}
        onNewConversation={handleNewConversation}
        onTabUpdate={(updates) => updateTab(activeTab.id, updates)}
        tabData={activeTab}
      />
    </Box>
  );
};

const ChatWithTabs: FC<ChatWithTabsProps> = (props) => {
  return (
    <TabManagerProvider>
      <ChatWithTabsInner {...props} />
    </TabManagerProvider>
  );
};

export default ChatWithTabs;