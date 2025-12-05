import type { SuggestionKeyDownProps } from "@tiptap/suggestion";

import type { RichMention, WorkspaceType } from "@app/types";

export type MentionDropdownOnKeyDown = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

export interface MentionDropdownProps {
  query: string;
  owner: WorkspaceType;
  conversationId: string | null;
  preferredAgentId?: string | null;
  command: (item: RichMention) => void;
  clientRect?: (() => DOMRect | null) | null;
  onClose?: () => void;
}
