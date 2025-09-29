import type { EmojiMartData as EmojiData } from "@dust-tt/sparkle";
import { avatarUtils, DataEmojiMart } from "@dust-tt/sparkle";

import type { SelectedEmojiType } from "@app/components/agent_builder/settings/avatar_picker/types";
import { EMOJI_AVATAR_BASE_URL } from "@app/components/agent_builder/settings/avatar_picker/types";

export function makeUrlForEmojiAndBackground(
  emoji: SelectedEmojiType,
  backgroundColor: `bg-${string}`
) {
  const { id, unified } = emoji;

  const avatarUrlSuffix = avatarUtils.createEmojiAndBackgroundUrlSuffix({
    backgroundColor,
    id,
    unified,
  });

  const url = `${EMOJI_AVATAR_BASE_URL}${avatarUrlSuffix}`;

  return url;
}

export function buildSelectedEmojiType(
  emojiString: string
): SelectedEmojiType | null {
  const emojiData: EmojiData = DataEmojiMart as EmojiData;

  const emoji = Object.values(emojiData.emojis).find(
    (e) => e.skins[0].native === emojiString
  );

  if (emoji) {
    return {
      id: emoji.id,
      native: emoji.skins[0].native,
      unified: emoji.skins[0].unified,
    };
  }

  return null;
}

function getDefaultAvatarUrlForPreview(): string | null {
  const emoji = buildSelectedEmojiType("🤖");
  if (!emoji) {
    return null;
  }
  return makeUrlForEmojiAndBackground(
    {
      id: emoji.id,
      unified: emoji.unified,
      native: emoji.native,
    },
    `bg-blue-200`
  );
}
