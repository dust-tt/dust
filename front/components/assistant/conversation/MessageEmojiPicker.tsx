import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  Button,
  cn,
  EmojiPicker,
  FaceSmile,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface MessageEmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function MessageEmojiPicker({
  onEmojiSelect,
  onOpenChange,
  className,
}: MessageEmojiPickerProps) {
  const { t } = useLingui();
  const handleSelect = (emoji: string) => {
    onEmojiSelect(emoji);
  };
  const theme = useTheme();

  return (
    <PopoverRoot modal={false} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          key="emoji-picker-button"
          tooltip={t`Add reaction`}
          variant="outline"
          size="xmini"
          icon={FaceSmile}
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
