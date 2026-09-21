export interface AvatarPickerTabElement {
  getUrl: () => Promise<string | null>;
}

export type SelectedEmojiType = {
  id: string;
  native: string;
  unified: string;
};

export {
  DROID_AVATAR_URLS,
  EMOJI_AVATAR_BASE_URL,
  SPIRIT_AVATAR_URLS,
} from "@app/lib/agent_builder/avatars";
