import type { EmojiData } from "@sparkle/lib/avatar/types";

const EMOJI_URL_REGEXP = /\/emojis\/bg-([^/]*)\/([^/]*)\/([^/.]*)/;

export type AvatarBackgroundColorType = `bg-${string}`;

let emojiDataCache: EmojiData | null = null;
let emojiDataPromise: Promise<EmojiData> | null = null;

/**
 * Preload emoji data for use by Avatar and EmojiPicker.
 * Returns a promise that resolves when data is cached.
 */
export function preloadEmojiData(): Promise<EmojiData> {
  if (emojiDataCache) {
    return Promise.resolve(emojiDataCache);
  }
  if (!emojiDataPromise) {
    emojiDataPromise = import("@emoji-mart/data").then((mod) => {
      emojiDataCache = mod.default as EmojiData;
      return emojiDataCache;
    });
  }
  return emojiDataPromise;
}

/**
 * This helper extracts emojis and background color from a Dust url.
 * URL structure is defined as such:
 * https://{host}/emojis/bg-{backgroundColor}/{id}/{unified}.
 *
 * Returns null if emoji data is not yet loaded or if the URL doesn't match.
 */
export function getEmojiAndBackgroundFromUrl(url: string) {
  if (!emojiDataCache) {
    return null;
  }

  const match = url.match(EMOJI_URL_REGEXP);
  if (match) {
    const [, backgroundColor, id, unified] = match;

    const emojiUnicodes = Object.values(emojiDataCache.emojis).find(
      (e) => e.id === id
    );
    if (!emojiUnicodes) {
      return null;
    }

    const skinEmoji = emojiUnicodes.skins.find((s) => s.unified === unified);
    if (!skinEmoji) {
      return null;
    }

    const prefixedBackgroundColor: AvatarBackgroundColorType = `bg-${backgroundColor}`;

    return {
      backgroundColor: prefixedBackgroundColor,
      id,
      unified,
      skinEmoji: skinEmoji.native,
    };
  }

  return null;
}

export function createEmojiAndBackgroundUrlSuffix({
  backgroundColor,
  id,
  unified,
}: {
  backgroundColor: AvatarBackgroundColorType;
  id: string;
  unified: string;
}) {
  return `emojis/${backgroundColor}/${id}/${unified}`;
}
