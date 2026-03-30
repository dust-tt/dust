import type { EmojiMartData } from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import type { EmojiSkinType } from "@sparkle/lib/avatar/types";
import { preloadEmojiData } from "@sparkle/lib/avatar/utils";
import React, { useEffect, useState } from "react";

interface EmojiPickerProps {
  data?: EmojiMartData;
  onEmojiSelect: (emoji: EmojiSkinType) => void;
  previewPosition?: "none";
  theme: "dark" | "light";
}

EmojiPicker.defaults = {
  previewPosition: "none",
};

function EmojiPicker({
  data,
  onEmojiSelect,
  previewPosition,
  theme,
}: EmojiPickerProps) {
  const [loadedData, setLoadedData] = useState<EmojiMartData | undefined>(data);

  useEffect(() => {
    if (!data) {
      preloadEmojiData().then((d) => setLoadedData(d as EmojiMartData));
    }
  }, [data]);

  if (!loadedData) {
    return null;
  }

  return (
    <Picker
      theme={theme}
      previewPosition={previewPosition}
      data={loadedData}
      onEmojiSelect={onEmojiSelect}
    />
  );
}

/**
 * Async getter for emoji mart data. Use in contexts where you need the raw data.
 */
async function getEmojiMartData(): Promise<EmojiMartData> {
  const data = await preloadEmojiData();
  return data as EmojiMartData;
}

export { EmojiMartData, EmojiPicker, getEmojiMartData };
