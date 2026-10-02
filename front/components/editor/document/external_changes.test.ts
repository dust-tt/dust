import { documentExtensions } from "@app/components/editor/document/extensions";
import {
  adoptionFrames,
  diffBlocks,
  insertedTextLength,
} from "@app/components/editor/document/external_changes";
import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";

const schema = getSchema(documentExtensions);

const doc = (markdownish: string[]) =>
  schema.nodeFromJSON({
    type: "doc",
    content: markdownish.map((text) =>
      text.startsWith("# ")
        ? {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: text.slice(2) }],
          }
        : { type: "paragraph", content: [{ type: "text", text }] }
    ),
  });

describe("diffBlocks", () => {
  it("leaves unchanged blocks alone and isolates the changed one", () => {
    const before = [
      ...doc(["# Title", "First.", "Second.", "Third."]).children,
    ];
    const after = [
      ...doc(["# Title", "First.", "Second, longer now.", "Third."]).children,
    ];

    const changes = diffBlocks(before, after);

    expect(changes).toHaveLength(1);
    expect(changes[0].from).toBe(2);
    expect(changes[0].to).toBe(3);
    expect(insertedTextLength(changes)).toBe("Second, longer now.".length);
  });

  it("treats a block the editor rewrote with default attributes as unchanged", () => {
    const before = [...doc(["# Title", "Same."]).children];
    // The same content, re-read from JSON as a freshly parsed file would be.
    const after = before.map((block) => schema.nodeFromJSON(block.toJSON()));

    expect(diffBlocks(before, after)).toHaveLength(0);
  });
});

describe("adoptionFrames", () => {
  it("types the changed paragraph in, one character per frame, at its position", () => {
    const before = [...doc(["# Title", "Old.", "Tail."]).children];
    const after = [...doc(["# Title", "New text.", "Tail."]).children];
    const changes = diffBlocks(before, after);

    const frames = [...adoptionFrames(schema, changes, before, 1)];

    // An empty paragraph first, then one character more per frame.
    expect(frames).toHaveLength("New text.".length + 1);
    expect(frames[0].blocks[0].textContent).toBe("");
    expect(frames[3].blocks[0].textContent).toBe("New");
    expect(frames[frames.length - 1].blocks[0].textContent).toBe("New text.");
    const titleSize = before[0].nodeSize;
    expect(frames[0].from).toBe(titleSize);
    expect(frames[0].to).toBe(titleSize + before[1].nodeSize);
    // Later frames replace the partially typed paragraph, whose size grows.
    expect(frames[1].to).toBe(titleSize + frames[0].blocks[0].nodeSize);
  });

  it("removes blocks in the first frame and yields nothing for an unchanged document", () => {
    const before = [...doc(["# Title", "Gone.", "Kept."]).children];
    const after = [...doc(["# Title", "Kept."]).children];

    const frames = [
      ...adoptionFrames(schema, diffBlocks(before, after), before, 5),
    ];
    expect(frames).toHaveLength(1);
    expect(frames[0].blocks).toHaveLength(0);
    expect([
      ...adoptionFrames(schema, diffBlocks(before, before), before, 5),
    ]).toHaveLength(0);
  });
});
