import {
  Avatar,
  avatarUtils,
  Button,
  ColorPicker,
  EmojiPicker,
  EmotionLaughIcon,
  PaintIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import React, { useEffect, useImperativeHandle, useRef, useState } from "react";

import type {
  AvatarPickerTabElement,
  SelectedEmojiType,
} from "@app/components/assistant_builder/avatar_picker/types";
import { makeUrlForEmojiAndBackgroud } from "@app/components/assistant_builder/avatar_picker/utils";
import { generateTailwindBackgroundColors } from "@app/types";

const DEFAULT_BACKGROUND_COLOR: avatarUtils.AvatarBackgroundColorType =
  "bg-gray-100";

interface AssistantBuilderEmojiPickerProps {
  avatarUrl: string | null;
  onChange: () => void;
}

const AssistantBuilderEmojiPicker = React.forwardRef<
  AvatarPickerTabElement,
  AssistantBuilderEmojiPickerProps
>(function EmojiAvatar(
  { avatarUrl, onChange }: AssistantBuilderEmojiPickerProps,
  ref
) {
  const emojiButtonRef = useRef<HTMLDivElement>(null);
  const colorButtonRef = useRef<HTMLDivElement>(null);

  const [selectedEmoji, setSelectedEmoji] = useState<SelectedEmojiType | null>(
    null
  );
  const [selectedBgColor, setSelectedBgColor] = useState<`bg-${string}`>(
    DEFAULT_BACKGROUND_COLOR
  );

  useEffect(() => {
    if (avatarUrl) {
      const emojiInfos = avatarUtils.getEmojiAndBackgroundFromUrl(avatarUrl);
      if (emojiInfos) {
        const { skinEmoji, id, unified, backgroundColor } = emojiInfos;

        setSelectedEmoji({
          native: skinEmoji,
          id,
          unified,
        });
        setSelectedBgColor(`${backgroundColor}`);
      }
    }
  }, [avatarUrl]);

  useImperativeHandle(ref, () => {
    return {
      getUrl: async () => {
        if (selectedEmoji) {
          return makeUrlForEmojiAndBackgroud(selectedEmoji, selectedBgColor);
        }

        return null;
      },
    };
  });

  return (
    <div className="mt-14 flex flex-col items-center gap-6">
      <Avatar
        emoji={selectedEmoji?.native}
        backgroundColor={selectedBgColor}
        size="xxl"
      />
      <div className="flex flex-row gap-2">
        <PopoverRoot>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              icon={EmotionLaughIcon}
              label="Pick an Emoji"
            />
          </PopoverTrigger>
          <PopoverContent className="p-4" fullWidth>
            <EmojiPicker
              theme="light"
              previewPosition="none"
              onEmojiSelect={(emoji) => {
                setSelectedEmoji({
                  id: emoji.id,
                  native: emoji.native,
                  unified: emoji.unified,
                });
                onChange();
                emojiButtonRef.current?.click();
              }}
            />
          </PopoverContent>
        </PopoverRoot>

        <PopoverRoot>
          <PopoverTrigger asChild>
            <Button variant="outline" icon={PaintIcon} label="Pick a color" />
          </PopoverTrigger>
          <PopoverContent mountPortal={false} className="p-4" fullWidth>
            <ColorPicker
              selectedColor={selectedBgColor}
              colors={
                generateTailwindBackgroundColors() as avatarUtils.AvatarBackgroundColorType[]
              }
              onColorSelect={(color) => {
                setSelectedBgColor(color as `bg-${string}`);
                // We only mark as stale if an emoji has been selected.
                if (selectedEmoji) {
                  onChange();
                }
                colorButtonRef.current?.click();
              }}
            />
          </PopoverContent>
        </PopoverRoot>
      </div>
    </div>
  );
});

export default AssistantBuilderEmojiPicker;
