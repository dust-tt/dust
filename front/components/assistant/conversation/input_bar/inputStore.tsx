import type { JSONContent } from "@tiptap/react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

type InputBarState = {
  conversations: Record<string, JSONContent>;
};

type InputBarActions = {
  updateConversation: (id: string, content: JSONContent) => void;
};

const useInputBarStore = create<InputBarState & { actions: InputBarActions }>()(
  persist(
    (set) => ({
      conversations: {},
      actions: {
        updateConversation: (id, content) => {
          if (id !== "new") {
            set((prevState) => ({
              conversations: {
                ...prevState.conversations,
                [id]: content,
              },
            }));
          }
        },
      },
    }),
    {
      name: "input-bar-storage",
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      partialize: ({ actions, ...state }) => ({ ...state }),
    }
  )
);

export const useChatDraft = (cId: string) => {
  return useInputBarStore(
    useShallow((state) => ({
      conversation: state.conversations[cId],
      updateConversation: state.actions.updateConversation,
    }))
  );
};
