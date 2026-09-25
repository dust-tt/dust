import { batchSuggestionDirective } from "@app/components/markdown/suggestion/BatchSuggestionDirective";
import { describe, expect, it } from "vitest";

describe("batchSuggestionDirective", () => {
  it("renders :batch_edit directives as batch_edit elements carrying the batch id", () => {
    const tree: any = {
      type: "root",
      children: [
        {
          type: "leafDirective",
          name: "batch_edit",
          attributes: { sId: "bsu_abc" },
          children: [],
        },
      ],
    };

    batchSuggestionDirective()(tree);

    expect(tree.children[0].data.hName).toBe("batch_edit");
    expect(tree.children[0].data.hProperties).toEqual({ batchId: "bsu_abc" });
  });

  it("renders a directive glued to the previous text", () => {
    const paragraph: any = {
      type: "paragraph",
      children: [{ type: "text", value: "Done::batch_edit[]{sId=bsu_abc}" }],
    };
    const tree: any = { type: "root", children: [paragraph] };

    batchSuggestionDirective()(tree);

    expect(paragraph.children).toHaveLength(1);
    expect(paragraph.children[0]).toMatchObject({
      type: "leafDirective",
      name: "batch_edit",
      data: { hName: "batch_edit", hProperties: { batchId: "bsu_abc" } },
    });
  });

  it("leaves other directives untouched", () => {
    const tree: any = {
      type: "root",
      children: [
        {
          type: "leafDirective",
          name: "skill_suggestion",
          attributes: { sId: "ssu_abc" },
          children: [],
        },
      ],
    };

    batchSuggestionDirective()(tree);

    expect(tree.children[0].data).toBeUndefined();
  });
});
