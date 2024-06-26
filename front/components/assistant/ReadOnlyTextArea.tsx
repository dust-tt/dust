import { classNames } from "@app/lib/utils";

export const ReadOnlyTextArea = ({ content }: { content: string | null }) => {
  return (
    <textarea
      disabled
      className={classNames(
        "block h-full min-h-60 w-full min-w-0 rounded-xl text-sm",
        "resize-none border-structure-200 bg-structure-50"
      )}
      defaultValue={content ?? ""}
    />
  );
};
