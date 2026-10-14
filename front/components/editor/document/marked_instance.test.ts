// @vitest-environment node
import { loadDfm } from "@app/components/editor/document/dfm_persistence";
import { createDocumentMarked } from "@app/components/editor/document/marked_instance";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";

const HIJACK = {
  name: "hijack",
  level: "block" as const,
  tokenizer: (src: string) => ({ type: "hijack", raw: src, tokens: [] }),
};

describe("createDocumentMarked", () => {
  it("gives each call an instance of its own", () => {
    const first = createDocumentMarked();
    const second = createDocumentMarked();

    first.use({ extensions: [HIJACK] });

    expect(first.defaults.extensions?.block).toHaveLength(1);
    expect(second.defaults.extensions?.block).toBeUndefined();
  });

  it("keeps documents parsing the same whatever marked's global instance holds", () => {
    // Without an instance, TipTap parses with marked's global one, as other editors do.
    new MarkdownManager().instance.use({ extensions: [HIJACK] });

    const loaded = loadDfm("# Title\n\nSome **bold** text.\n");

    expect(loaded.isOk()).toBe(true);
  });
});
