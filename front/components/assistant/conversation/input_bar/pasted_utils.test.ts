import { describe, expect, test } from "vitest";

import {
  getDisplayDateFromPastedFileId,
  getDisplayNameFromPastedFileId,
  getPastedFileName,
} from "./pasted_utils";

describe("pasted_utils", () => {
  test("getDisplayNameFromPastedFileId and getDisplayDateFromPastedFileId from generated filename", () => {
    const pastedFileName = getPastedFileName(7);
    expect(getDisplayNameFromPastedFileId(pastedFileName)).toBe("Pasted (7)");
    expect(getDisplayDateFromPastedFileId(pastedFileName)).not.toBeUndefined();
  });
});
