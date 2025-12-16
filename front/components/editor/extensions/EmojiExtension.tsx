import type { EmojiMartData } from "@emoji-mart/data";
import data from "@emoji-mart/data";
import type { EmojiItem } from "@tiptap/extension-emoji";
import Emoji from "@tiptap/extension-emoji";

import { createEmojiSuggestion } from "@app/components/editor/input_bar/emojiSuggestion";

// Type the imported data
const emojiData = data as unknown as EmojiMartData;

// Convert emoji-mart data to TipTap emoji format
const emojiMartToTipTapEmojis = (): EmojiItem[] => {
  const emojis: EmojiItem[] = [];

  for (const [id, emoji] of Object.entries(emojiData.emojis)) {
    emojis.push({
      name: id,
      emoji: emoji.skins[0].native,
      fallbackImage: "",
      shortcodes: [id],
      tags: emoji.keywords ?? [],
    });
  }

  return emojis;
};

const emojiMartEmojis = emojiMartToTipTapEmojis();
const emojiMap = new Map(emojiMartEmojis.map((e) => [e.name, e]));

export const EmojiExtension = Emoji.extend({
  renderMarkdown: (node) => {
    const emojiItem = emojiMap.get(node.attrs?.name);
    return emojiItem?.emoji ?? `:${node.attrs?.name}:`;
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

  // Use emoji-mart emojis instead of default TipTap emojis
  emojis: emojiMartEmojis,
});
