import { describe, expect, it } from "vitest";

import { isSupportedFile } from "./supported_files";

describe("isSupportedFile", () => {
  it("supports Clojure source files", () => {
    for (const extension of [".clj", ".cljc", ".cljs"]) {
      expect(isSupportedFile(`source${extension}`)).toBe(true);
    }
  });
});
