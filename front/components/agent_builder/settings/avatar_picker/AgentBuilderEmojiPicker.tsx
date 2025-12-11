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
} from "@app/components/agent_builder/settings/avatar_picker/types";
import { makeUrlForEmojiAndBackground } from "@app/components/agent_builder/settings/avatar_picker/utils";
import { generateTailwindBackgroundColors } from "@app/types";

const DEFAULT_BACKGROUND_COLOR: avatarUtils.AvatarBackgroundColorType =
  "bg-gray-100";

interface AgentBuilderEmojiPickerProps {
  avatarUrl: string | null;
  onChange: () => void;
}

const AgentBuilderEmojiPicker = React.forwardRef<
  AvatarPickerTabElement,
  AgentBuilderEmojiPickerProps
>(function EmojiAvatar(
  { avatarUrl, onChange }: AgentBuilderEmojiPickerProps,
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
          return makeUrlForEmojiAndBackground(selectedEmoji, selectedBgColor);
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
        size="2xl"
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
          <PopoverContent fullWidth>
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
          <PopoverContent mountPortal={false} className="w-fit">
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

export default AgentBuilderEmojiPicker;
