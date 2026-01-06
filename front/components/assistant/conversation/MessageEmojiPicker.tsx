import {
  Button,
  EmojiPicker,
  EmotionLaughIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import React from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";

interface MessageEmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

export function MessageEmojiPicker({ onEmojiSelect }: MessageEmojiPickerProps) {
  const handleSelect = (emoji: string) => {
    onEmojiSelect(emoji);
  };
  const theme = useTheme();

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button
          key="emoji-picker-button"
          tooltip="Add reaction"
          variant="ghost-secondary"
          size="xs"
          icon={EmotionLaughIcon}
        />
      </PopoverTrigger>
      <PopoverContent fullWidth>
        <EmojiPicker
          // needed as EmojiPicker don't auto adapt to the theme
          theme={theme.isDark ? "dark" : "light"}
          previewPosition="none"
          onEmojiSelect={(emoji) => {
            handleSelect(emoji.native);
          }}
        />
      </PopoverContent>
    </PopoverRoot>
  );
}
