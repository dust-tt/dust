export interface AvatarPickerTabElement {
  getUrl: () => Promise<string | null>;
}

export type SelectedEmojiType = {
  id: string;
  native: string;
  unified: string;
};
