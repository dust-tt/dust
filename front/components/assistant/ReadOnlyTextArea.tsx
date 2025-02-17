import { TextArea } from "@dust-tt/sparkle";

import { classNames } from "@app/lib/utils";

export const ReadOnlyTextArea = ({ content }: { content: string | null }) => {
  return (
    <TextArea
      disabled
      isDisplay
      className={classNames(
        "block h-full min-h-60 w-full min-w-0 rounded-xl text-sm",
        "resize-none border-structure-200 bg-structure-50",
        "dark:border-structure-200-night dark:bg-structure-50-night"
      )}
      defaultValue={content ?? ""}
    />
  );
};
