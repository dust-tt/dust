import type { SearchFilter } from "@app/components/shared/filter_panel/searchFilter";
import {
  parseSearchFilterHash,
  serializeSearchFilterHash,
} from "@app/components/shared/filter_panel/searchFilterHash";
import { describe, expect, it } from "vitest";

const CATEGORIES = ["editor", "skill", "tool"] as const;

function encode(json: string): string {
  return Buffer.from(json).toString("base64url");
}

describe("searchFilterHash", () => {
  it("round-trips a filter, without editor avatars", () => {
    const filter: SearchFilter<(typeof CATEGORIES)[number]> = {
      editor: [
        {
          category: "editor",
          id: "user1",
          name: "Me",
          image: "https://example.com/me.png",
          disabled: false,
        },
      ],
      skill: [
        {
          category: "skill",
          id: "skill1",
          name: "Research",
          icon: null,
          disabled: false,
        },
      ],
      tool: [
        {
          category: "tool",
          id: "server1",
          name: "Zendesk",
          icon: "ZendeskLogo",
          mcpServerViewIds: ["view1", "view2"],
          disabled: false,
        },
      ],
    };

    expect(
      parseSearchFilterHash(serializeSearchFilterHash(filter), CATEGORIES)
    ).toEqual({
      ...filter,
      editor: [{ ...filter.editor?.[0], image: null }],
    });
  });

  it("serializes an empty filter as no value", () => {
    expect(serializeSearchFilterHash({ skill: [] })).toBeUndefined();
  });

  it("encodes non-ASCII names as URL-safe base64", () => {
    const value = serializeSearchFilterHash({
      skill: [
        {
          category: "skill",
          id: "skill1",
          name: "Développeur 🚀",
          icon: null,
          disabled: false,
        },
      ],
    });

    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parseSearchFilterHash(value, CATEGORIES).skill?.[0].name).toBe(
      "Développeur 🚀"
    );
  });

  it.each([
    undefined,
    "",
    "not base64!",
  ])("parses %j as an empty filter", (value) => {
    expect(parseSearchFilterHash(value, CATEGORIES)).toEqual({});
  });

  it.each([
    "not json",
    "[]",
    '{"skill":"skill1"}',
  ])("parses encoded %j as an empty filter", (json) => {
    expect(parseSearchFilterHash(encode(json), CATEGORIES)).toEqual({});
  });

  it("drops invalid, misplaced and unlisted options only", () => {
    const skill = {
      category: "skill",
      id: "skill1",
      name: "Research",
      icon: null,
      disabled: false,
    };
    const value = JSON.stringify({
      skill: [skill, { ...skill, id: "" }],
      editor: [skill],
      tool: [
        {
          category: "tool",
          id: "server1",
          name: "Unknown",
          icon: "NotAnIcon",
          mcpServerViewIds: [],
          disabled: false,
        },
      ],
      model: [{ category: "model", id: "gpt", name: "GPT", disabled: false }],
    });

    expect(parseSearchFilterHash(encode(value), CATEGORIES)).toEqual({
      skill: [skill],
    });
  });
});
