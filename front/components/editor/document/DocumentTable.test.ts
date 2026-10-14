// @vitest-environment node
import {
  documentSchema,
  serializeDocumentMarkdown,
} from "@app/components/editor/document/content";
import { loadDfm } from "@app/components/editor/document/dfm_persistence";
import { documentExtensions } from "@app/components/editor/document/extensions";
import { createDocumentMarked } from "@app/components/editor/document/marked_instance";
import { Err, Ok } from "@app/types/shared/result";
import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const markdown = () =>
  new MarkdownManager({
    extensions: documentExtensions,
    marked: createDocumentMarked(),
  });

const parse = (source: string): JSONContent => markdown().parse(source);

const rewrite = (source: string): string => {
  const manager = markdown();
  return manager.serialize(manager.parse(source)).replace(/\n+$/, "");
};

const cellTexts = (document: JSONContent): string[][] =>
  (document.content?.[0].content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      (cell.content?.[0].content ?? [])
        .map((inline) => inline.text ?? "")
        .join("")
    )
  );

describe("table Markdown", () => {
  it("reads a GFM table, its first row as an ordinary row", () => {
    const document = parse("| a | b |\n| --- | --- |\n| 1 | 2 |\n");

    expect(document.content?.[0].type).toBe("table");
    expect(cellTexts(document)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(() => documentSchema.nodeFromJSON(document).check()).not.toThrow();
  });

  it.each([
    [
      "inline formatting",
      "| **bold** | *italic* | `code` | [link](https://dust.tt) | ~~struck~~ |\n| --- | --- | --- | --- | --- |\n| a | b | c | d | e |",
    ],
    ["an escaped pipe", "| a \\| b |\n| --- |\n| `c \\| d` |"],
    ["a table in a quote", "> | a | b |\n> | --- | --- |\n> | 1 | 2 |"],
    [
      "aligned columns",
      "| a | b | c | d |\n| :-- | :-: | --: | --- |\n| 1 | 2 | 3 | 4 |",
    ],
  ])("writes back %s as it reads", (_, source) => {
    expect(rewrite(source)).toBe(source);
  });

  it.each([
    [
      "padded cells compactly",
      "| name  | count |\n|-------|-------|\n| apple | 3     |\n",
      "| name | count |\n| --- | --- |\n| apple | 3 |",
    ],
    [
      "a short row padded to the header",
      "| a | b |\n| --- | --- |\n| 1 |\n",
      "| a | b |\n| --- | --- |\n| 1 |  |",
    ],
    [
      "alignment markers in their short form",
      "| a | b |\n|:----|----:|\n| 1 | 2 |\n",
      "| a | b |\n| :-- | --: |\n| 1 | 2 |",
    ],
    [
      "an unescaped pipe in code escaped, as one cell",
      "| a | b |\n| --- | --- |\n| `x|y` | 2 |\n",
      "| a | b |\n| --- | --- |\n| `x\\|y` | 2 |",
    ],
    [
      "a table in a list item after a blank line",
      "- item\n\n  | a |\n  | --- |\n  | 1 |\n",
      "- item\n  \n  | a |\n  | --- |\n  | 1 |",
    ],
  ])("writes %s", (_, source, written) => {
    expect(rewrite(source)).toBe(written);
  });

  it("saves a cell whose text starts or ends with spaces, without them", () => {
    const cell = (text: string) => ({
      type: "tableCell",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });

    expect(
      serializeDocumentMarkdown({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              { type: "tableRow", content: [cell("a ")] },
              { type: "tableRow", content: [cell("  b")] },
            ],
          },
        ],
      })
    ).toEqual(new Ok("| a |\n| --- |\n| b |"));
  });

  it("saves a row without alignment in an aligned table, aligned as its column", () => {
    const cell = (text: string, align: string | null) => ({
      type: "tableCell",
      attrs: { align },
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });

    expect(
      serializeDocumentMarkdown({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              { type: "tableRow", content: [cell("a", "right")] },
              { type: "tableRow", content: [cell("1", "right")] },
              { type: "tableRow", content: [cell("2", null)] },
            ],
          },
        ],
      })
    ).toEqual(new Ok("| a |\n| --: |\n| 1 |\n| 2 |"));
  });

  it("opens a table whose Markdown it normalizes", () => {
    expect(
      loadDfm("| a  | b |\n|:---|--:|\n| `x|y` | 2 |\n| 3 |\n").isOk()
    ).toBe(true);
  });

  it.each([
    ["at the top level", "| a | b |\n| --- | --- |\n| 1 | 2 | 3 |\n"],
    ["in a list item", "- item\n\n  | a |\n  | --- |\n  | 1 | 2 |\n"],
  ])("refuses a row with more cells than its header %s", (_, source) => {
    expect(loadDfm(source)).toEqual(
      new Err(
        "The Markdown uses formatting the editor cannot keep: a table row with more cells than its header."
      )
    );
  });

  it("counts neither an escaped pipe nor a pipe in code as a cell", () => {
    expect(
      loadDfm("| a | b |\n| --- | --- |\n| x \\| y | `p|q` |\n").isOk()
    ).toBe(true);
  });
});

describe("pasted tables", () => {
  const pasteHtml = (html: string) => {
    const { window } = new JSDOM(`<body>${html}</body>`);
    return ProseMirrorDOMParser.fromSchema(documentSchema)
      .parse(window.document.body)
      .toJSON();
  };

  it("keeps merged, sized, aligned and header cells as plain cells", () => {
    const document = pasteHtml(
      `<table><tr><th>Name</th><th colspan="2" style="width:200px;text-align:right">Total</th></tr>` +
        `<tr><td rowspan="2" colwidth="100">a</td><td>1</td><td>2</td></tr></table>`
    );
    const cells = document.content[0].content.flatMap(
      (row: JSONContent) => row.content ?? []
    );

    expect(cells.map((cell: JSONContent) => cell.attrs)).toEqual(
      cells.map(() => ({ colspan: 1, rowspan: 1, colwidth: null, align: null }))
    );
    expect(cellTexts(document)[0]).toEqual(["Name", "Total"]);
  });
});
