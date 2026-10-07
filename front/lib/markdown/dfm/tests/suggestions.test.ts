import {
  parseDfm,
  readMessageSuggestions,
  suggestionBlock,
} from "@app/lib/markdown/dfm";
import { INPUT_LIMITS } from "@app/lib/markdown/dfm/parser";
import {
  expectError,
  FIXTURES,
  unwrap,
} from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { describe, expect, it } from "vitest";

describe("readMessageSuggestions", () => {
  it("splits the suggestion from the text around it", () => {
    expect(
      unwrap(
        readMessageSuggestions(
          "Shorter:\n\n```suggestion\nShip on **Friday**.\n```\n\nThoughts?"
        )
      )
    ).toEqual([
      { kind: "text", text: "Shorter:" },
      { kind: "suggestion", suggestion: "Ship on **Friday**." },
      { kind: "text", text: "Thoughts?" },
    ]);
  });

  it("reads an empty suggestion as a deletion", () => {
    expect(unwrap(readMessageSuggestions("```suggestion\n```"))).toEqual([
      { kind: "suggestion", suggestion: "" },
    ]);
  });

  it("reads every suggestion block in order", () => {
    expect(
      unwrap(
        readMessageSuggestions(
          "**Option 1**\n\n````suggestion\nOne\n````\n\n**Option 2**\n\n```suggestion\nTwo\n```\n```suggestion\nThree\n```"
        )
      )
    ).toEqual([
      { kind: "text", text: "**Option 1**" },
      { kind: "suggestion", suggestion: "One" },
      { kind: "text", text: "**Option 2**" },
      { kind: "suggestion", suggestion: "Two" },
      { kind: "suggestion", suggestion: "Three" },
    ]);
  });

  it.each([
    ["plain text", "Looks good."],
    ["another language", "```ts\nconst a = 1;\n```"],
    ["a quoted block", "> ```suggestion\n> Nested\n> ```"],
    ["inline code", "Use `suggestion` blocks."],
  ])("finds none in %s", (_, body) => {
    expect(unwrap(readMessageSuggestions(body))).toBeNull();
  });

  it("reads the suggestion of the fixture", () => {
    const fixture = FIXTURES.find(({ name }) => name === "suggested_change.md");
    const [message] = unwrap(parseDfm(fixture?.source ?? "")).comments[0]
      .messages;

    expect(unwrap(readMessageSuggestions(message.body))).toEqual([
      { kind: "text", text: "The last fix lands Thursday night." },
      { kind: "suggestion", suggestion: "Ship on **Friday**." },
    ]);
  });
});

describe("suggestionBlock", () => {
  it.each([
    "Ship on Friday.",
    "",
    "Run `npm test` first.",
    "A fence: ``` inside, and ```` longer.",
    '::message{author=user:x name="x" at=2026-10-05T09:13:02.500Z}',
  ])("reads back %j", (suggestion) => {
    expect(
      unwrap(readMessageSuggestions(unwrap(suggestionBlock(suggestion))))
    ).toEqual([{ kind: "suggestion", suggestion }]);
  });

  it("refuses a suggestion whose fences take the block out of bounds", () => {
    const suggestion = "`".repeat(INPUT_LIMITS.delimiters / 3);

    expectError(
      suggestionBlock(suggestion),
      "emphasis, link or code delimiters"
    );
  });
});
