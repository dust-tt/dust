import { TextArea } from "@dust-tt/sparkle";

import { classNames } from "@app/lib/utils";

export const ReadOnlyTextArea = ({ content }: { content: string | null }) => {
  return (
    <TextArea
      disabled
      isDisplay
      className={classNames(
        "copy-sm block h-full min-h-60 w-full min-w-0 rounded-xl",
        "resize-none border-border bg-muted-background",
        "dark:border-border-night dark:bg-muted-background-night"
      )}
      defaultValue={content ?? ""}
    />
  );
};
