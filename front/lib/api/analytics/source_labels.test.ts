import {
  SOURCE_BY_PROGRAMMATIC_ORIGIN,
  SOURCE_LABELS,
} from "@app/lib/api/analytics/source_labels";
import { describe, expect, it } from "vitest";

describe("SOURCE_LABELS", () => {
  it("offers no programmatic origin as a source of its own", () => {
    expect(
      Object.keys(SOURCE_LABELS).filter(
        (source) => source in SOURCE_BY_PROGRAMMATIC_ORIGIN
      )
    ).toEqual([]);
  });

  it("folds every programmatic origin into an offered source", () => {
    expect(
      Object.values(SOURCE_BY_PROGRAMMATIC_ORIGIN).filter(
        (source) => !(source in SOURCE_LABELS)
      )
    ).toEqual([]);
  });
});
