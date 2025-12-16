import Emoji, { emojis, shortcodeToEmoji } from "@tiptap/extension-emoji";

import { createEmojiSuggestion } from "@app/components/editor/input_bar/emojiSuggestion";

export const EmojiExtension = Emoji.extend({
  renderMarkdown: (node) => {
    const emojiItem = shortcodeToEmoji(node.attrs?.name, emojis);

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
});
