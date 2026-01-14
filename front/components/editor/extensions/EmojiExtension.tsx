import type { EmojiMartData } from "@emoji-mart/data";
import type { EmojiItem } from "@tiptap/extension-emoji";
import Emoji from "@tiptap/extension-emoji";

import { createEmojiSuggestion } from "@app/components/editor/input_bar/emojiSuggestion";

// Cache for lazily loaded emoji data
let emojiDataCache: EmojiMartData | null = null;
let emojiMapCache: Map<string, EmojiItem> | null = null;
let emojiListCache: EmojiItem[] | null = null;

// Load emoji data lazily
async function loadEmojiData(): Promise<void> {
  if (emojiDataCache) {
    return;
  }

  // Dynamically import emoji data to avoid bundling in server
  // @emoji-mart/data exports JSON directly, so we cast it appropriately
  const dataModule = await import("@emoji-mart/data");
  emojiDataCache = dataModule as unknown as EmojiMartData;

  // Convert emoji-mart data to TipTap emoji format
  const emojis: EmojiItem[] = [];
  for (const [id, emoji] of Object.entries(emojiDataCache.emojis)) {
    emojis.push({
      name: id,
      emoji: emoji.skins[0].native,
      shortcodes: [id],
      tags: emoji.keywords ?? [],
      version: emoji.version,
      emoticons: emoji.emoticons ?? [],
    });
  }

  emojiListCache = emojis;
  emojiMapCache = new Map(emojis.map((e) => [e.name, e]));
}

// Synchronous getter for emoji map (returns null if not loaded)
function getEmojiFromCache(name: string): EmojiItem | undefined {
  return emojiMapCache?.get(name);
}

// Create extension that lazily loads emoji data
export const EmojiExtension = Emoji.extend({
  renderMarkdown: (node) => {
    const name = node.attrs?.name;

    // If name is null/undefined, return empty string to avoid displaying :null:
    if (!name) {
      return "";
    }

    // Try to get from cache, fallback to shortcode format
    const emojiItem = getEmojiFromCache(name);
    return emojiItem?.emoji ?? `:${name}:`;
  },

  onCreate() {
    void loadEmojiData();
  },
}).configure({
  // Enable emoticon conversion (e.g., <3 → ❤️, :) → 😊)
  enableEmoticons: true,

  // HTML attributes for styling
  HTMLAttributes: {
    class: "inline-block",
  },

  // Configure suggestion plugin for :emoji: syntax
  suggestion: createEmojiSuggestion(),

  // Start with empty emojis - emoticon conversion won't work until data loads
  // The emoji picker/search uses EmojiDropdown which loads data independently
  emojis: [],
});

// Export a function to preload emoji data if needed
export async function preloadEmojiData(): Promise<void> {
  await loadEmojiData();
}

// Export function to get emoji list (for components that need it synchronously after preload)
export function getLoadedEmojiList(): EmojiItem[] {
  return emojiListCache ?? [];
}
