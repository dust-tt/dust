import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  Button,
  cn,
  EmojiPicker,
  EmotionLaughIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";

interface MessageEmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  className?: string;
}

export function MessageEmojiPicker({
  onEmojiSelect,
  className,
}: MessageEmojiPickerProps) {
  const handleSelect = (emoji: string) => {
    onEmojiSelect(emoji);
  };
  const theme = useTheme();

  return (
    <PopoverRoot modal={false}>
      <PopoverTrigger asChild>
        <Button
          key="emoji-picker-button"
          tooltip="Add reaction"
          variant="outline"
          size="xmini"
          icon={EmotionLaughIcon}
          isSelect
          className={cn("text-muted-foreground", className)}
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
