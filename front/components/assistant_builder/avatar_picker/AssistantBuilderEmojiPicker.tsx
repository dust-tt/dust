import {
  Avatar,
  avatarUtils,
  Button,
  ColorPicker,
  DropdownMenu,
  EmojiPicker,
  EmotionLaughIcon,
  PaintIcon,
} from "@dust-tt/sparkle";
import { generateTailwindBackgroundColors } from "@dust-tt/types";
import type { EmojiMartData } from "@emoji-mart/data";
import data from "@emoji-mart/data";
import React, { useEffect } from "react";
import { useImperativeHandle, useRef, useState } from "react";

import type { AvatarPickerTabElement } from "@app/components/assistant_builder/avatar_picker/types";
import { EMOJI_AVATAR_BASE_URL } from "@app/components/assistant_builder/shared";

type SelectedEmojiType = {
  id: string;
  native: string;
  unified: string;
};

export function getEmojiAndBackgroundFromUrl(url: string) {
  // Proposed URL structure:
  // https://dust.tt/emojis/color/id/unified

  const regex = /\/emojis\/([^//]*)\/([^//]*)\/([^//.]*)/;

  const d: EmojiMartData = data;

  const match = url.match(regex);
  if (match) {
    const [, color, id, unified] = match;

    const emojiUnicodes = Object.values(d.emojis).find((e) => e.id === id);
    if (!emojiUnicodes) {
      return null;
    }

    console.log(">> emojiUnicodes:", emojiUnicodes);

    const skinEmoji = emojiUnicodes.skins.find((s) => s.unified === unified);
    if (!skinEmoji) {
      return null;
    }

    return {
      color,
      id,
      unified,
      native: skinEmoji.native,
    };
  }

  return null;
}

function makeUrlForEmojiAndBackgroud(
  emoji: SelectedEmojiType,
  backgroundColor: `bg-${string}`
) {
  const { id, unified } = emoji;

  console.log(">> EMOJI_AVATAR_BASE_URL:", EMOJI_AVATAR_BASE_URL);

  const url = `${EMOJI_AVATAR_BASE_URL}${avatarUtils.createEmojiAndBackgroundUrlSuffix(
    {
      backgroundColor,
      id,
      unified,
    }
  )}`;

  console.log(">> pictureURLLLLL:", url);

  return url;
}

const DEFAULT_BACKGROUND_COLOR = "bg-gray-100";

interface AssistantBuilderEmojiPickerProps {
  onChange: () => void;
  avatarUrl: string;
}

const AssistantBuilderEmojiPicker = React.forwardRef<
  AvatarPickerTabElement,
  AssistantBuilderEmojiPickerProps
>(function EmojiAvatar(
  { onChange, avatarUrl }: AssistantBuilderEmojiPickerProps,
  ref
) {
  const emojiButtonRef = useRef<HTMLDivElement>(null);
  const colorButtonRef = useRef<HTMLDivElement>(null);

  const [selectedEmoji, setSelectedEmoji] = useState<SelectedEmojiType | null>(
    null
  );
  const [selectedBgColor, setSelectedBgColor] = useState(
    DEFAULT_BACKGROUND_COLOR
  );

  useEffect(() => {
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
  }, [avatarUrl]);

  useImperativeHandle(ref, () => {
    return {
      getUrl: async () => {
        // TODO: Only set isState when both are setup.
        if (selectedEmoji) {
          const url = makeUrlForEmojiAndBackgroud(
            selectedEmoji,
            selectedBgColor
          );

          // getEmojiAndBackgroundFromUrl(url);

          return url;
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
        <DropdownMenu>
          <DropdownMenu.Button>
            <div ref={emojiButtonRef}>
              <Button
                variant="tertiary"
                icon={EmotionLaughIcon}
                label="Pick an Emoji"
              />
            </div>
          </DropdownMenu.Button>
          <DropdownMenu.Items width={350} origin="topLeft" variant="no-padding">
            <EmojiPicker
              theme="light"
              previewPosition="none"
              onEmojiSelect={(emoji) => {
                console.log(">> selected emoji:", emoji);
                setSelectedEmoji({
                  id: emoji.id,
                  native: emoji.native,
                  unified: emoji.unified,
                });
                onChange();
                emojiButtonRef.current?.click();
              }}
            />
          </DropdownMenu.Items>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenu.Button>
            <div ref={colorButtonRef}>
              <Button
                variant="tertiary"
                icon={PaintIcon}
                label="Pick a color"
              />
            </div>
          </DropdownMenu.Button>
          <DropdownMenu.Items width={240} origin="topLeft" variant="no-padding">
            <ColorPicker
              colors={generateTailwindBackgroundColors()}
              onColorSelect={(color) => {
                setSelectedBgColor(color);
                onChange();
                colorButtonRef.current?.click();
              }}
            />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
    </div>
  );
});

export default AssistantBuilderEmojiPicker;
