import { substituteAnchorDirectives } from "@app/components/editor/document/DocumentCommentAnchor";
import { describe, expect, it } from "vitest";

const START = "0";
const END = "1";
const directives = new Map([
  [START, ":comment-start{id=c1}"],
  [END, ":comment-end{id=c1}"],
]);

describe("substituteAnchorDirectives", () => {
  it("replaces every placeholder with its directive", () => {
    const substituted = substituteAnchorDirectives(
      `Hi ${START}there${END}.`,
      directives
    );

    expect(substituted.isOk() && substituted.value).toBe(
      "Hi :comment-start{id=c1}there:comment-end{id=c1}."
    );
  });

  it.each([
    ["is missing", `Hi ${START}there.`],
    ["appears twice", `Hi ${START}there${END} ${END}.`],
    ["was not produced for the document", `Hi ${START}there${END}7.`],
  ])("fails when a placeholder %s", (_, markdown) => {
    expect(substituteAnchorDirectives(markdown, directives).isErr()).toBe(true);
  });
});
