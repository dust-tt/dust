import type { SearchFilterOption } from "@app/components/shared/filter_panel/searchFilter";
import {
  resolveSearchFilterSelection,
  toSearchFilterSelection,
} from "@app/components/shared/filter_panel/searchFilter";
import { describe, expect, it } from "vitest";

const CATEGORIES = ["access", "editor", "model", "tool"] as const;

const SLACK_VIEWS = [
  { sId: "view1", mcpServerId: "slack", name: "Slack", icon: "SlackLogo" },
  { sId: "view2", mcpServerId: "slack", name: "Slack", icon: "SlackLogo" },
] as const;

describe("resolveSearchFilterSelection", () => {
  it("names the selection from facets and groups tool views by server", () => {
    const { filter, unresolvedCategories } = resolveSearchFilterSelection({
      selection: {
        access: { visible: "Published", invalid: "Invalid" },
        editor: { user1: "Old name" },
        tool: { view1: "Slack", view2: "Slack" },
      },
      categories: CATEGORIES,
      knownOptions: new Map(),
      facets: {
        editors: [{ sId: "user1", fullName: "Alice", image: null }],
        mcpServerViews: [...SLACK_VIEWS],
      },
      currentUserId: "me",
    });

    expect(unresolvedCategories).toEqual([]);
    expect(filter.access?.map(({ id }) => id)).toEqual(["visible"]);
    expect(filter.editor?.map(({ name }) => name)).toEqual(["Alice"]);
    expect(filter.tool).toEqual([
      expect.objectContaining({
        id: "slack",
        name: "Slack",
        mcpServerViewIds: ["view1", "view2"],
      }),
    ]);
    expect(toSearchFilterSelection(filter, CATEGORIES)).toEqual({
      access: { visible: "Published" },
      editor: { user1: "Alice" },
      tool: { view1: "Slack", view2: "Slack" },
    });
  });

  it("falls back on known options, then on the selected labels", () => {
    const known: SearchFilterOption = {
      category: "editor",
      id: "user1",
      name: "Alice",
      image: null,
      disabled: false,
    };
    const { filter, unresolvedCategories, unresolvedKeys } =
      resolveSearchFilterSelection({
        selection: {
          editor: { user1: "Old name", user2: "Bob" },
          model: { "retired-model": "Retired model" },
          tool: { view3: "Notion" },
        },
        categories: CATEGORIES,
        knownOptions: new Map([["editor:user1", known]]),
        facets: undefined,
        currentUserId: "me",
      });

    expect(filter.editor?.map(({ name }) => name)).toEqual(["Alice", "Bob"]);
    expect(filter.model?.map(({ name }) => name)).toEqual(["Retired model"]);
    expect(filter.tool?.[0]).toEqual(
      expect.objectContaining({
        id: "view3",
        name: "Notion",
        mcpServerViewIds: ["view3"],
      })
    );
    expect(unresolvedCategories).toEqual(["editor", "model", "tool"]);
    expect([...unresolvedKeys]).toEqual([
      "editor:user2",
      "model:retired-model",
      "tool:view3",
    ]);
  });
});
