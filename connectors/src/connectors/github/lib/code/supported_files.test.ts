import { describe, expect, it } from "vitest";

import { isSupportedFile } from "./supported_files";

describe("isSupportedFile", () => {
  it("supports Clojure source files", () => {
    for (const extension of [".clj", ".cljc", ".cljs"]) {
      expect(isSupportedFile(`source${extension}`)).toBe(true);
    }
  });

  it("supports Elixir source and template files", () => {
    for (const extension of [".ex", ".exs", ".eex", ".heex", ".leex"]) {
      expect(isSupportedFile(`source${extension}`)).toBe(true);
    }
  });
});
