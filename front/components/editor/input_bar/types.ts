import type { SuggestionKeyDownProps } from "@tiptap/suggestion";

import type { RichMention, WorkspaceType } from "@app/types";

export type MentionDropdownOnKeyDown = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

export interface MentionDropdownProps {
  query: string;
  owner: WorkspaceType;
  conversationId: string | null;
  includeCurrentUser?: boolean;
  command: (item: RichMention) => void;
  clientRect?: (() => DOMRect | null) | null;
  onClose?: () => void;
  select: {
    agents: boolean;
    users: boolean;
  };
}

export type EmojiDropdownOnKeyDown = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

export interface EmojiDropdownProps {
  query: string;
  command: (item: { name: string }) => void;
  clientRect?: (() => DOMRect | null) | null;
  onClose?: () => void;
}
