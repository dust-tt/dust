import {
  parseSearchPageHash,
  serializeSearchPageHash,
} from "@app/components/shared/filter_panel/searchFilterHash";
import {
  SKILL_FILTER_CATEGORIES,
  SKILL_SEARCH_TAB_IDS,
} from "@app/components/skills/skillFilter";
import { describe, expect, it } from "vitest";

function parse(value: string | undefined) {
  return parseSearchPageHash(
    value,
    SKILL_FILTER_CATEGORIES,
    SKILL_SEARCH_TAB_IDS,
    "all"
  );
}

function encode(json: string): string {
  return Buffer.from(json).toString("base64url");
}

describe("searchPageHash", () => {
  it("round-trips the tab and the selected labels as URL-safe base64", () => {
    const state = {
      tabId: "archived" as const,
      selection: {
        editor: { user1: "Alice" },
        tool: { view1: "Slack", view2: "Slack" },
      },
    };
    const value = serializeSearchPageHash(state, "all");

    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(value ?? "", "base64url").toString()).toBe(
      '{"tab":"archived","filter":{"editor":{"user1":"Alice"},"tool":{"view1":"Slack","view2":"Slack"}}}'
    );
    expect(parse(value)).toEqual(state);
  });

  it("omits the default tab and empty selections", () => {
    expect(
      serializeSearchPageHash({ tabId: "all", selection: { skill: {} } }, "all")
    ).toBeUndefined();
    expect(
      Buffer.from(
        serializeSearchPageHash(
          { tabId: "all", selection: { skill: { skill1: "Research" } } },
          "all"
        ) ?? "",
        "base64url"
      ).toString()
    ).toBe('{"filter":{"skill":{"skill1":"Research"}}}');
  });

  it.each([
    undefined,
    "",
    "not base64!",
    encode("not json"),
    encode("[]"),
  ])("parses %j as the default state", (value) => {
    expect(parse(value)).toEqual({ tabId: "all", selection: {} });
  });

  it("drops invalid values individually", () => {
    const value = encode(
      JSON.stringify({
        tab: "unknown",
        filter: {
          editor: { user1: "Alice", "": "Empty", user2: 42 },
          skill: "skill1",
          model: { gpt: "GPT" },
          tool: Object.fromEntries(
            Array.from({ length: 101 }, (_, i) => [`view${i}`, "Slack"])
          ),
        },
      })
    );

    expect(parse(value)).toEqual({
      tabId: "all",
      selection: {
        editor: { user1: "Alice" },
        tool: Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [`view${i}`, "Slack"])
        ),
      },
    });
  });
});
