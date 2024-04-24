import type {
  Emoji,
  EmojiMartData as EmojiData,
  Skin as EmojiSkin,
} from "@emoji-mart/data";

export type EmojiSkinType = Pick<Emoji, "id" | "name" | "keywords"> & {
  native: string;
  shortcodes: string;
  unified: string;
};

export { EmojiData, EmojiSkin };
