import {
  buildFrameFunctionsTarArchive,
  parseFrameFunctionsTarArchive,
} from "@app/lib/api/frames/functions_archive";
import { describe, expect, it } from "vitest";

describe("buildFrameFunctionsTarArchive", () => {
  it("builds a non-empty tar containing each function entry name", async () => {
    const tar = await buildFrameFunctionsTarArchive([
      { name: "list-todos", content: "export default { fetch() {} }" },
      { name: "add-todo", content: "export default { fetch() {} }" },
    ]);

    expect(tar.byteLength).toBeGreaterThan(0);
    // ustar stores path names in the header; a simple string search is enough
    // to confirm both entries were appended without depending on a tar parser.
    const asLatin1 = tar.toString("latin1");
    expect(asLatin1).toContain("list-todos.ts");
    expect(asLatin1).toContain("add-todo.ts");
  });
});

describe("parseFrameFunctionsTarArchive", () => {
  it("round-trips every entry by function name", async () => {
    const entries = [
      { name: "list-todos", content: "export default { list() {} }" },
      { name: "add-todo", content: "export default { add() {} }" },
    ];
    const tar = await buildFrameFunctionsTarArchive(entries);

    await expect(parseFrameFunctionsTarArchive(tar)).resolves.toEqual(
      new Map(entries.map(({ name, content }) => [name, content]))
    );
  });
});
