import type { EmojiMartData } from "@emoji-mart/data";
import emojiData from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import type { EmojiSkinType } from "@sparkle/lib/avatar/types";
import React from "react";

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
  data = emojiData as EmojiMartData,
  onEmojiSelect,
  previewPosition,
  theme,
}: EmojiPickerProps) {
  return (
    // emoji-mart styles its search input with `var(--color-border, …)` and that
    // custom property inherits through its shadow DOM. Our design tokens define
    // `--color-border` globally (dark in dark mode), which would otherwise
    // override emoji-mart's own themed value and produce a dark search input on
    // a light picker. Reset the colliding tokens here so emoji-mart falls back
    // to its built-in light/dark values driven by the `theme` prop.
    <div
      style={
        {
          "--color-border": "initial",
          "--color-border-over": "initial",
        } as React.CSSProperties
      }
    >
      <Picker
        theme={theme}
        previewPosition={previewPosition}
        data={data}
        onEmojiSelect={onEmojiSelect}
      />
    </div>
  );
}

export { EmojiMartData, EmojiPicker, emojiData as DataEmojiMart };
