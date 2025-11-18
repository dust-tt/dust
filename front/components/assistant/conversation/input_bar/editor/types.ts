import type { SuggestionKeyDownProps } from "@tiptap/suggestion";

import type { RichMention } from "@app/types";

export type MentionDropdownOnKeyDown = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

export interface MentionDropdownProps {
  items: RichMention[];
  command: (item: RichMention) => void;
  clientRect?: (() => DOMRect | null) | null;
  onClose?: () => void;
}
