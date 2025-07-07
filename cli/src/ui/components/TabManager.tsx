import type { AgentConfiguration } from "@dust-tt/client";
import React, { createContext, useContext, useRef, useState } from "react";

import type { ConversationItem } from "./Conversation.js";
import type { UploadedFile } from "./FileUpload.js";

export interface Tab {
  id: string;
  title: string;
  conversationId: string | null;
  selectedAgent: AgentConfiguration | null;
  conversationItems: ConversationItem[];
  userInput: string;
  cursorPosition: number;
  uploadedFiles: UploadedFile[];
  isProcessingQuestion: boolean;
  createdAt: number;
}

interface TabManagerContextType {
  tabs: Tab[];
  activeTabId: string;
  activeTab: Tab | null;
  createTab: (title?: string, conversationId?: string | null) => Tab;
  closeTab: (tabId: string) => void;
  switchToTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
  getNextTabId: () => string;
}

const TabManagerContext = createContext<TabManagerContextType | null>(null);

export const useTabManager = () => {
  const context = useContext(TabManagerContext);
  if (!context) {
    throw new Error("useTabManager must be used within a TabManagerProvider");
  }
  return context;
};

interface TabManagerProviderProps {
  children: React.ReactNode;
}

export const TabManagerProvider: React.FC<TabManagerProviderProps> = ({ children }) => {
  const tabIdCounter = useRef(0);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");

  const getNextTabId = () => {
    tabIdCounter.current += 1;
    return `tab-${tabIdCounter.current}`;
  };

  const createDefaultTab = (title: string, conversationId: string | null = null): Tab => {
    const id = getNextTabId();
    return {
      id,
      title,
      conversationId,
      selectedAgent: null,
      conversationItems: [],
      userInput: "",
      cursorPosition: 0,
      uploadedFiles: [],
      isProcessingQuestion: false,
      createdAt: Date.now(),
    };
  };

  const createTab = (title = "New Chat", conversationId: string | null = null) => {
    const newTab = createDefaultTab(title, conversationId);
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    return newTab;
  };

  const closeTab = (tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(tab => tab.id !== tabId);
      
      // If closing the active tab, switch to another tab
      if (tabId === activeTabId) {
        if (newTabs.length === 0) {
          // If no tabs left, create a new one
          const newTab = createDefaultTab("New Chat");
          setActiveTabId(newTab.id);
          return [newTab];
        } else {
          // Switch to the next tab or previous if it was the last one
          const closedTabIndex = prev.findIndex(tab => tab.id === tabId);
          const nextTabIndex = closedTabIndex < newTabs.length ? closedTabIndex : newTabs.length - 1;
          setActiveTabId(newTabs[nextTabIndex].id);
        }
      }
      
      return newTabs;
    });
  };

  const switchToTab = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
    }
  };

  const updateTab = (tabId: string, updates: Partial<Tab>) => {
    setTabs(prev => prev.map(tab => 
      tab.id === tabId 
        ? { ...tab, ...updates } 
        : tab
    ));
  };

  const activeTab = tabs.find(tab => tab.id === activeTabId) || null;

  // Initialize with first tab if no tabs exist
  React.useEffect(() => {
    if (tabs.length === 0) {
      createTab();
    }
  }, []);

  return (
    <TabManagerContext.Provider value={{
      tabs,
      activeTabId,
      activeTab,
      createTab,
      closeTab,
      switchToTab,
      updateTab,
      getNextTabId,
    }}>
      {children}
    </TabManagerContext.Provider>
  );
};