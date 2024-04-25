import { avatarUtils } from "@dust-tt/sparkle";

import type { SelectedEmojiType } from "@app/components/assistant_builder/avatar_picker/types";
import { EMOJI_AVATAR_BASE_URL } from "@app/components/assistant_builder/shared";

export function makeUrlForEmojiAndBackgroud(
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
