import {
  parseFilterHash,
  serializeFilterHash,
} from "@app/components/shared/filter_panel/filterHash";
import {
  SKILL_FILTER_CATEGORIES,
  SKILL_SEARCH_TAB_IDS,
} from "@app/components/skills/skillFilter";
import { describe, expect, it } from "vitest";

function parse(value: string | undefined) {
  return parseFilterHash(value, {
    categories: SKILL_FILTER_CATEGORIES,
    tabIds: SKILL_SEARCH_TAB_IDS,
    defaultTabId: "all",
    maxIdsPerCategory: 100,
  });
}

function encode(json: string): string {
  return Buffer.from(json).toString("base64url");
}

describe("filterHash", () => {
  it("round-trips the tab and the selected labels as URL-safe base64", () => {
    const state = {
      tabId: "archived" as const,
      selection: {
        editor: { user1: "Alice" },
        tool: { view1: "Slack", view2: "Slack" },
      },
    };
    const value = serializeFilterHash(state, "all");

    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(value ?? "", "base64url").toString()).toBe(
      '{"tab":"archived","filter":{"editor":{"user1":"Alice"},"tool":{"view1":"Slack","view2":"Slack"}}}'
    );
    expect(parse(value)).toEqual({ ...state, fields: {} });
  });

  it("round-trips extra fields and omits the undefined ones", () => {
    const value = serializeFilterHash({ tabId: "all", selection: {} }, "all", {
      period: 30,
      granularity: undefined,
    });

    expect(Buffer.from(value ?? "", "base64url").toString()).toBe(
      '{"period":30}'
    );
    expect(parse(value).fields).toEqual({ period: 30 });
  });

  it("omits the default tab and empty selections", () => {
    expect(
      serializeFilterHash({ tabId: "all", selection: { skill: {} } }, "all")
    ).toBeUndefined();
    expect(
      Buffer.from(
        serializeFilterHash(
          { tabId: "all", selection: { skill: { skill1: "Research" } } },
          "all"
        ) ?? "",
        "base64url"
      ).toString()
    ).toBe('{"filter":{"skill":{"skill1":"Research"}}}');
  });

  it.each([undefined, "", "not base64!", encode("not json"), encode("[]")])(
    "parses %j as the default state",
    (value) => {
      expect(parse(value)).toEqual({ tabId: "all", selection: {}, fields: {} });
    }
  );

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
      fields: {},
    });
  });
});
