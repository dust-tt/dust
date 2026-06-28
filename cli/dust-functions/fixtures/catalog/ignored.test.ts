// A *.test.ts file inside the handler folder. `discover` must ignore it.
// It carries one trivial test so the project's `bun test` run stays clean.
import { expect, test } from "bun:test";

test("fixture test file is ignored by discover", () => {
  expect(true).toBe(true);
});
