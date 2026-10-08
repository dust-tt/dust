import { i18n } from "@app/lib/i18n/i18n";
import { describe, expect, test } from "vitest";

import {
  getDisplayDateFromPastedFileId,
  getDisplayNameFromPastedFileId,
  getPastedAttachmentChipTitle,
  getPastedFileName,
} from "./pasted_utils";

describe("pasted_utils", () => {
  test("getDisplayNameFromPastedFileId and getDisplayDateFromPastedFileId from generated filename", () => {
    const pastedFileName = getPastedFileName(7);
    expect(
      getDisplayNameFromPastedFileId(pastedFileName, (descriptor) =>
        i18n._(descriptor)
      )
    ).toBe("Pasted (7)");
    expect(getPastedAttachmentChipTitle(pastedFileName)).toBe("Pasted (7)");
    expect(getDisplayDateFromPastedFileId(pastedFileName)).not.toBeUndefined();
  });
});
