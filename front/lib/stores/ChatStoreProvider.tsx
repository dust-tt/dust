"use client";

import type { JSONContent } from "@tiptap/react";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef } from "react";
import type { StoreApi } from "zustand";
import { useStore as useZustandStore } from "zustand";

import type { DataSourceViewContentNode } from "@app/types";

import type { Chat, ChatState } from "./chatStore";
import { createChatStore } from "./chatStore";

type ChatAction = {
  saveContent: (content: JSONContent) => void;
  resetChat: () => void;
  setAttachedNode: (node: DataSourceViewContentNode) => void;
  removeAttachedNode: (node: DataSourceViewContentNode) => void;
  resetAttachedNodes: () => void;
};

export const ChatStoreContext = createContext<StoreApi<ChatState> | null>(null);

export interface ChatStoreProviderProps {
  children: ReactNode;
}

export const ChatStoreProvider = ({ children }: ChatStoreProviderProps) => {
  const storeRef = useRef<StoreApi<ChatState>>();
  if (!storeRef.current) {
    storeRef.current = createChatStore();
  }

  return (
    <ChatStoreContext.Provider value={storeRef.current}>
      <ChatStoreUrlSync>{children}</ChatStoreUrlSync>
    </ChatStoreContext.Provider>
  );
};

const useChatStore = <T,>(selector: (store: ChatState) => T): T => {
  const chatStoreContext = useContext(ChatStoreContext);

  if (!chatStoreContext) {
    throw new Error("useStore must be use within ChatStoreProvider");
  }

  return useZustandStore(chatStoreContext, selector);
};

export const useChat = (conversationId: string | null): Chat => {
  const chat = useChatStore((state) => state.chats[conversationId ?? "new"]);

  if (!chat) {
    return {
      content: { type: "doc", content: [] },
      attachedNodes: [],
    };
  }

  return chat;
};

export const useChatsActions = () => useChatStore((state) => state.actions);

export const useCurrentChat = () => {
  const activeConversationId = useCurrentConversationId();
  const chat = useChat(activeConversationId);

  if (!chat) {
    return {
      content: { type: "doc", content: [] },
      attachedNodes: [],
    };
  }

  return chat;
};
export const useCurrentConversationId = () =>
  useChatStore((state) => state.activeConversationId);
export const useCurrentChatActions = () => {
  const activeConversationId = useCurrentConversationId();
  const actions = useChatActions(activeConversationId);

  return actions;
};

export const useChatActions = (conversationId: string | null): ChatAction => {
  const actions = useChatStore((state) => state.actions);
  const id = conversationId ?? "new";

  const chatAction: ChatAction = {
    saveContent: (content: JSONContent) => actions.saveContent(id, content),
    resetChat: () => actions.resetChat(id),
    setAttachedNode: (node: DataSourceViewContentNode) =>
      actions.setAttachedNode(id, node),
    removeAttachedNode: (node: DataSourceViewContentNode) =>
      actions.removeAttachedNode(id, node),
    resetAttachedNodes: () => actions.resetAttachedNodes(id),
  };

  return chatAction;
};

export const ChatStoreUrlSync = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const cId = router.query.cId;
  const initialConversationId = useChatStore(
    (state) => state.initialConversationId
  );
  const { setActiveConversationId } = useChatsActions();
  useEffect(() => {
    if (cId && typeof cId === "string") {
      setActiveConversationId(cId === "new" ? null : cId);
      return;
    }

    setActiveConversationId(initialConversationId ?? null);
  }, [cId, initialConversationId, setActiveConversationId]);

  return children;
};
