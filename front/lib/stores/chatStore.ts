import type { JSONContent } from "@tiptap/react";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { DataSourceViewContentNode } from "@app/types";

export interface Chat {
  content: JSONContent;
  attachedNodes: DataSourceViewContentNode[];
}

export interface ChatState {
  initialConversationId: string | null;
  activeConversationId: string | null;
  chats: Record<string, Chat>;
  actions: {
    setActiveConversationId: (conversationId: string | null) => void;
    setInitialConversationId: (conversationId: string | null) => void;
    initializeChat: (conversationId: string) => void;
    saveContent: (conversationId: string, content: JSONContent) => void;
    resetChat: (conversationId: string) => void;
    setAttachedNode: (
      conversationId: string,
      node: DataSourceViewContentNode
    ) => void;
    removeAttachedNode: (
      conversationId: string,
      node: DataSourceViewContentNode
    ) => void;
    resetAttachedNodes: (conversationId: string) => void;
  };
}

const DEFAULT_CONTENT = { type: "doc", content: [] };

export const createChatStore = () => {
  return create<ChatState>()(
    immer(
      devtools((set) => ({
        activeConversationId: null,
        initialConversationId: null,
        chats: {},
        actions: {
          setActiveConversationId: (conversationId: string | null) => {
            set(
              (state) => {
                state.activeConversationId = conversationId;
              },
              undefined,
              "setActiveConversationId"
            );
          },
          setInitialConversationId: (conversationId: string | null) => {
            set((state) => {
              state.initialConversationId = conversationId;
            });
          },
          initializeChat: (conversationId = "new") => {
            set(
              (state) => {
                state.chats[conversationId] = {
                  content: DEFAULT_CONTENT,
                  attachedNodes: [],
                };
              },
              undefined,
              "initializeChat"
            );
          },
          saveContent: (conversationId = "new", content: JSONContent) => {
            set(
              (state) => {
                if (!state.chats[conversationId]) {
                  state.chats[conversationId] = {
                    content: DEFAULT_CONTENT,
                    attachedNodes: [],
                  };
                }
                state.chats[conversationId].content = content;
              },
              undefined,
              "saveContent"
            );
          },
          resetChat: (conversationId = "new") => {
            set(
              (state) => {
                state.chats[conversationId] = {
                  content: DEFAULT_CONTENT,
                  attachedNodes: [],
                };
              },
              undefined,
              "resetChat"
            );
          },
          setAttachedNode: (
            conversationId,
            node: DataSourceViewContentNode
          ) => {
            set(
              (state) => {
                if (!state.chats[conversationId]) {
                  state.chats[conversationId] = {
                    content: DEFAULT_CONTENT,
                    attachedNodes: [],
                  };
                }
                state.chats[conversationId].attachedNodes.push(node);
              },
              undefined,
              "setAttachedNode"
            );
          },
          removeAttachedNode: (
            conversationId = "new",
            node: DataSourceViewContentNode
          ) => {
            set(
              (state) => {
                state.chats[conversationId].attachedNodes = state.chats[
                  conversationId
                ].attachedNodes.filter((n) => n.internalId !== node.internalId);
              },
              undefined,
              "removeAttachedNode"
            );
          },
          resetAttachedNodes: (conversationId = "new") => {
            set(
              (state) => {
                state.chats[conversationId].attachedNodes = [];
              },
              undefined,
              "resetAttachedNodes"
            );
          },
        },
      }))
    )
  );
};
