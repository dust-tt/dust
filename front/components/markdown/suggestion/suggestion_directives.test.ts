import {
  extractSuggestionPile,
  MAX_SUGGESTION_RECAP_LENGTH,
} from "@app/components/markdown/suggestion/suggestion_directives";
import { describe, expect, it } from "vitest";

const batchDirective = (sId: string) => `:batch_edit[]{sId=${sId}}`;
const agentDirective = (sId: string) =>
  `:agent_suggestion[]{sId=${sId} kind=name agentId=agent_1}`;

describe("extractSuggestionPile", () => {
  it("keeps a single batch inline", () => {
    const content = `Here is my change:\n\n${batchDirective("b1")}`;

    expect(extractSuggestionPile(content)).toEqual({
      content,
      pileBatchIds: [],
      recap: null,
    });
  });

  it("moves two or more batches into the pile, in order", () => {
    const content = [
      "First:",
      batchDirective("b1"),
      "Then:",
      batchDirective("b2"),
    ].join("\n\n");

    const result = extractSuggestionPile(content);

    expect(result.pileBatchIds).toEqual(["b1", "b2"]);
    expect(result.content).not.toContain("batch_edit");
    expect(result.content).toContain("First:");
    expect(result.content).toContain("Then:");
  });

  it("counts a repeated batch once", () => {
    const result = extractSuggestionPile(
      "Done.\n\n:batch_edit[]{sId=b1}\n\n:batch_edit[]{sId=b1}\n"
    );
    expect(result.pileBatchIds).toEqual([]);
    expect(result.content).toContain(":batch_edit[]{sId=b1}");

    const piled = extractSuggestionPile(
      ":batch_edit[]{sId=b1}\n:batch_edit[]{sId=b2}\n:batch_edit[]{sId=b1}\n"
    );
    expect(piled.pileBatchIds).toEqual(["b1", "b2"]);
    expect(piled.content).not.toContain("batch_edit");
  });

  it("handles directives glued to the previous word", () => {
    const content = `issues:${batchDirective("b1")} and ${batchDirective("b2")}`;

    const result = extractSuggestionPile(content);

    expect(result.pileBatchIds).toEqual(["b1", "b2"]);
    expect(result.content).toBe("issues and ");
  });

  it("leaves directives missing a batch id untouched", () => {
    const content = [
      batchDirective("b1"),
      batchDirective("b2"),
      ":batch_edit[]{}",
    ].join("\n\n");

    const result = extractSuggestionPile(content);

    expect(result.pileBatchIds).toEqual(["b1", "b2"]);
    expect(result.content).toContain(":batch_edit[]{}");
  });

  it("does not pile individual suggestions", () => {
    const content = [agentDirective("s1"), agentDirective("s2")].join("\n\n");

    expect(extractSuggestionPile(content)).toEqual({
      content,
      pileBatchIds: [],
      recap: null,
    });
  });

  it("returns the first recap with the pile and strips every recap", () => {
    const content = [
      ":suggestion_recap[Rename the skill and sharpen its description.]",
      batchDirective("b1"),
      batchDirective("b2"),
      ":suggestion_recap[Ignored second recap.]",
    ].join("\n\n");

    const result = extractSuggestionPile(content);

    expect(result.recap).toBe("Rename the skill and sharpen its description.");
    expect(result.content).not.toContain("suggestion_recap");
  });

  it("caps a long recap", () => {
    const content = [
      `:suggestion_recap[${"a".repeat(200)}]`,
      batchDirective("b1"),
      batchDirective("b2"),
    ].join("\n\n");

    const { recap } = extractSuggestionPile(content);

    expect(recap).toHaveLength(MAX_SUGGESTION_RECAP_LENGTH);
    expect(recap?.endsWith("…")).toBe(true);
  });

  it("strips a recap without returning it when there is no pile", () => {
    const content = `:suggestion_recap[One change.]\n\n${batchDirective("b1")}`;

    expect(extractSuggestionPile(content)).toEqual({
      content: `\n\n${batchDirective("b1")}`,
      pileBatchIds: [],
      recap: null,
    });
  });

  it("reads quoted attribute values", () => {
    const content = [':batch_edit[]{sId="b1"}', ":batch_edit[]{sId='b2'}"].join(
      "\n\n"
    );

    const result = extractSuggestionPile(content);

    expect(result.pileBatchIds).toEqual(["b1", "b2"]);
    expect(result.content).not.toContain("batch_edit");
  });

  it("ignores directives inside code spans and fences", () => {
    const content = [
      batchDirective("b1"),
      `Syntax: \`${batchDirective("b2")}\``,
      `\`\`\`\n${batchDirective("b3")}\n\`\`\``,
    ].join("\n\n");

    expect(extractSuggestionPile(content)).toEqual({
      content,
      pileBatchIds: [],
      recap: null,
    });
  });
});
