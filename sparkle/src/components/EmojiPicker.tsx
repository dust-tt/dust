import type { EmojiMartData } from "@emoji-mart/data";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import React from "react";

import { EmojiSkinType } from "@sparkle/lib/avatar/types";

interface EmojiPickerProps {
  data?: EmojiMartData;
  onEmojiSelect: (emoji: EmojiSkinType) => void;
  previewPosition?: "none";
  theme: "dark" | "light";
}

EmojiPicker.defaults = {
  previewPosition: "none",
};

function EmojiPicker({
  data,
  onEmojiSelect,
  previewPosition,
  theme,
}: EmojiPickerProps) {
  return (
    <Picker
      theme={theme}
      previewPosition={previewPosition}
      data={data}
      onEmojiSelect={onEmojiSelect}
      className="s-border-0 s-p-0"
    />
  );
}

export { data as DataEmojiMart, EmojiMartData, EmojiPicker };
