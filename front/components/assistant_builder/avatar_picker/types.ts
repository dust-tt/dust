import type { Emoji } from "@emoji-mart/data";

export interface AvatarPickerTabElement {
  getUrl: () => Promise<string | null>;
}
