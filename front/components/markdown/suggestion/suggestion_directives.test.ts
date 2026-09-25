import {
  extractSuggestionPile,
  MAX_SUGGESTION_RECAP_LENGTH,
} from "@app/components/markdown/suggestion/suggestion_directives";
import { describe, expect, it } from "vitest";

const agentDirective = (sId: string) =>
  `:agent_suggestion[]{sId=${sId} kind=name agentId=agent_1}`;
const skillDirective = (sId: string) =>
  `:skill_suggestion[]{sId=${sId} kind=edit skillId=skill_1}`;

describe("extractSuggestionPile", () => {
  it("keeps a single suggestion inline", () => {
    const content = `Here is my change:\n\n${agentDirective("s1")}`;

    expect(extractSuggestionPile(content)).toEqual({
      content,
      pileDirectives: [],
      recap: null,
    });
  });

  it("moves two or more suggestions into the pile, in order", () => {
    const content = [
      "First:",
      skillDirective("s1"),
      "Then:",
      agentDirective("s2"),
    ].join("\n\n");

    const result = extractSuggestionPile(content);

    expect(result.pileDirectives).toEqual([
      { type: "skill", sId: "s1", skillId: "skill_1" },
      { type: "agent", sId: "s2", kind: "name", agentId: "agent_1" },
    ]);
    expect(result.content).not.toContain("_suggestion");
    expect(result.content).toContain("First:");
    expect(result.content).toContain("Then:");
  });

  it("handles directives glued to the previous word", () => {
    const content = `issues:${agentDirective("s1")} and ${agentDirective("s2")}`;

    const result = extractSuggestionPile(content);

    expect(result.pileDirectives.map((d) => d.sId)).toEqual(["s1", "s2"]);
    expect(result.content).toBe("issues and ");
  });

  it("leaves directives missing an identifier untouched", () => {
    const sidekickDirective = ":agent_suggestion[]{sId=s3 kind=name}";
    const content = [
      agentDirective("s1"),
      agentDirective("s2"),
      sidekickDirective,
    ].join("\n\n");

    const result = extractSuggestionPile(content);

    expect(result.pileDirectives.map((d) => d.sId)).toEqual(["s1", "s2"]);
    expect(result.content).toContain(sidekickDirective);
  });

  it("does not pile kinds that have no conversational card", () => {
    const content = [
      agentDirective("s1"),
      ":agent_suggestion[]{sId=s2 kind=tools agentId=agent_1}",
    ].join("\n\n");

    expect(extractSuggestionPile(content)).toEqual({
      content,
      pileDirectives: [],
      recap: null,
    });
  });

  it("returns the first recap with the pile and strips every recap", () => {
    const content = [
      ":suggestion_recap[Rename the skill and sharpen its description.]",
      agentDirective("s1"),
      skillDirective("s2"),
      ":suggestion_recap[Ignored second recap.]",
    ].join("\n\n");

    const result = extractSuggestionPile(content);

    expect(result.recap).toBe("Rename the skill and sharpen its description.");
    expect(result.content).not.toContain("suggestion_recap");
  });

  it("caps a long recap", () => {
    const content = [
      `:suggestion_recap[${"a".repeat(200)}]`,
      agentDirective("s1"),
      agentDirective("s2"),
    ].join("\n\n");

    const { recap } = extractSuggestionPile(content);

    expect(recap).toHaveLength(MAX_SUGGESTION_RECAP_LENGTH);
    expect(recap?.endsWith("…")).toBe(true);
  });

  it("strips a recap without returning it when there is no pile", () => {
    const content = `:suggestion_recap[One change.]\n\n${agentDirective("s1")}`;

    expect(extractSuggestionPile(content)).toEqual({
      content: `\n\n${agentDirective("s1")}`,
      pileDirectives: [],
      recap: null,
    });
  });

  it("reads quoted attribute values", () => {
    const content = [
      ':agent_suggestion[]{sId="s1" kind="name" agentId="agent_1"}',
      ":skill_suggestion[]{sId='s2' skillId='skill_1'}",
    ].join("\n\n");

    const result = extractSuggestionPile(content);

    expect(result.pileDirectives).toEqual([
      { type: "agent", sId: "s1", kind: "name", agentId: "agent_1" },
      { type: "skill", sId: "s2", skillId: "skill_1" },
    ]);
    expect(result.content).not.toContain("_suggestion");
  });

  it("ignores directives inside code spans and fences", () => {
    const content = [
      agentDirective("s1"),
      `Syntax: \`${agentDirective("s2")}\``,
      `\`\`\`\n${agentDirective("s3")}\n\`\`\``,
    ].join("\n\n");

    expect(extractSuggestionPile(content)).toEqual({
      content,
      pileDirectives: [],
      recap: null,
    });
  });
});
