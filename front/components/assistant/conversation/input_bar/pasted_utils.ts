import { formatDateTime } from "@app/lib/i18n/format";
import { formatDate } from "@app/lib/utils/timestamps";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export { isPastedFile } from "@app/lib/files";

type Translate = (descriptor: MessageDescriptor) => string;

const PASTED_FILE_COUNT_REGEX = /^pasted-text-(\d+)_/;

/**
 * @cc [owner:sfriquet,label:product] untranslated-pasted-chip-title
 * The result MUST NOT depend on the UI locale: it is persisted in the message content as the
 * `:pasted_content[title]` directive and sent to models.
 */
export const getPastedAttachmentChipTitle = (id: string): string => {
  const match = id.match(PASTED_FILE_COUNT_REGEX);
  if (match) {
    return `Pasted (${match[1]})`;
  }
  return "Pasted";
};

export const getDisplayNameFromPastedFileId = (
  id: string,
  t: Translate
): string => {
  const match = id.match(PASTED_FILE_COUNT_REGEX);
  if (match) {
    const count = match[1];
    return t(msg`Pasted (${count})`);
  }
  return t(msg`Pasted`);
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
    return formatDateTime(new Date(datePart), {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return undefined;
};

export const getPastedFileName = (count: number): string => {
  return `pasted-text-${count}_${formatDate(new Date(), "yyyy-MM-dd_HH-mm-ss")}.txt`;
};
