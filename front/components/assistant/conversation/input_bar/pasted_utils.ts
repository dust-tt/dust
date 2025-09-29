import dayjs from "dayjs";

export const getDisplayNameFromPastedFileId = (id: string): string => {
  const match = id.match(/^pasted-text-(\d+)_/);
  if (match) {
    return `Pasted (${match[1]})`;
  }
  return "Pasted";
};

export const getDisplayDateFromPastedFileId = (
  id: string
): string | undefined => {
  const match = id.match(
    /^pasted-text-(\d+)_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.txt$/
  );
  if (match) {
    const datePart = match[2]
      .replace("_", " ")
      // convert the "-" in time part into ":" to make it a valid date
      .replace(/-(\d{2})-(\d{2})$/, ":$1:$2");
    return new Date(datePart).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return undefined;
};

export const getPastedFileName = (count: number): string => {
  return `pasted-text-${count}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.txt`;
};

export const isPastedFile = (contentType: string | undefined): boolean => {
  return contentType === "text/vnd.dust.attachment.pasted";
};
