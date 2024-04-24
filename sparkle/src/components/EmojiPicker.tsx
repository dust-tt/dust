import type { EmojiMartData, Skin } from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import React from "react";

interface EmojiPickerProps {
  data: EmojiMartData;
  onEmojiSelect: (emoji: Skin) => void;
  previewPosition?: "none";
  theme: "dark" | "light";
}

EmojiPicker.defaults = {
  previewPosition: "none",
};

export function EmojiPicker({
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
    />
  );
}
