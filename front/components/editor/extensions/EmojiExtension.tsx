import { createEmojiSuggestion } from "@app/components/editor/input_bar/emojiSuggestion";
import type { EmojiMartData } from "@emoji-mart/data";
import type { EmojiItem } from "@tiptap/extension-emoji";
import Emoji from "@tiptap/extension-emoji";

// Cache for lazily loaded emoji data
let emojiDataCache: EmojiMartData | null = null;
let emojiMapCache: Map<string, EmojiItem> | null = null;
const emojis: EmojiItem[] = [];

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

  async onCreate() {
    await loadEmojiData();
  },
}).configure({
  // Disable emoticon conversion to prevent :null: bug
  // When enableEmoticons is true with an empty emojis array, TipTap creates
  // an input rule with regex (?:^|\s)() $ which matches any double space,
  // creating emoji nodes with name: null that render as :null:
  // TODO: To enable emoticons, we need to either:
  // 1. Load emoji data synchronously before extension creation, or
  // 2. Implement a mechanism to update input rules after async data loads
  enableEmoticons: false,

  // HTML attributes for styling
  HTMLAttributes: {
    class: "inline-block",
  },

  // Configure suggestion plugin for :emoji: syntax
  suggestion: createEmojiSuggestion(),

  // Start with empty emojis array - this is populated asynchronously in onCreate()
  // The emoji picker/search uses EmojiDropdown which loads data independently
  emojis,
});
