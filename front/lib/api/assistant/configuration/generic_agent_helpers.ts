import {
  buildSelectedEmojiType,
  makeUrlForEmojiAndBackground,
} from "@app/components/agent_builder/settings/avatar_picker/utils";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";

export function assistantHandleIsValid(handle: string): boolean {
  return /^[a-zA-Z0-9_-]{1,30}$/.test(handle);
}

export function getAgentPictureUrl(
  emoji: string | undefined,
  backgroundColor: `bg-${string}`
): string {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const selectedEmoji = emoji || "🤖";
  const emojiData = buildSelectedEmojiType(selectedEmoji);

  if (emojiData) {
    return makeUrlForEmojiAndBackground(
      {
        id: emojiData.id,
        unified: emojiData.unified,
        native: emojiData.native,
      },
      backgroundColor
    );
  } else {
    return DUST_AVATAR_URL;
  }
}
