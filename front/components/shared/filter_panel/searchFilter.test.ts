import {
  AGENT_FILTER_CATEGORIES,
  AGENT_SEARCH_TABS,
  toAgentSearchFilters,
} from "@app/components/assistant/manager/agentFilter";
import type { SearchFilterOption } from "@app/components/shared/filter_panel/searchFilter";
import {
  getSearchFilterPresets,
  resolveSearchFilterSelection,
  toSearchFilterSelection,
  toUsageFilterOption,
} from "@app/components/shared/filter_panel/searchFilter";
import {
  SKILL_FILTER_CATEGORIES,
  toSkillSearchFilters,
} from "@app/components/skills/skillFilter";
import { i18n } from "@app/lib/i18n/i18n";
import type { UserType } from "@app/types/user";
import type { MessageDescriptor } from "@lingui/core";
import { describe, expect, it } from "vitest";

const translate = (descriptor: MessageDescriptor) => i18n._(descriptor);

const CATEGORIES = [
  ...new Set([...AGENT_FILTER_CATEGORIES, ...SKILL_FILTER_CATEGORIES]),
];

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
      t: translate,
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
        t: translate,
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

describe("usage filter", () => {
  it("names a usage range from its ID and drops invalid ranges", () => {
    const { filter, unresolvedCategories } = resolveSearchFilterSelection({
      selection: {
        usage: {
          "5-40": "Stale label",
          "40-5": "Inverted",
          "1-x": "Bad",
          [`0-${"9".repeat(309)}`]: "Infinite",
        },
      },
      categories: CATEGORIES,
      knownOptions: new Map(),
      facets: undefined,
      currentUserId: "me",
      t: translate,
    });

    expect(unresolvedCategories).toEqual([]);
    expect(filter.usage).toEqual([
      toUsageFilterOption({ min: 5, max: 40 }, translate),
    ]);
    expect(filter.usage?.[0]?.name).toBe("5–40 active users");
    expect(toUsageFilterOption({ min: 1, max: 1 }, translate).name).toBe(
      "1 active user"
    );
    expect(toSearchFilterSelection(filter, CATEGORIES)).toEqual({
      usage: { "5-40": "5–40 active users" },
    });
  });

  it("filters on the active users count, except for default agents", () => {
    const filter = {
      usage: [toUsageFilterOption({ min: 5, max: 40 }, translate)],
    };
    const [allTab, defaultTab] = AGENT_SEARCH_TABS;

    expect(toAgentSearchFilters(filter, allTab.filters)).toEqual({
      ...allTab.filters,
      activeUsersCount: { min: 5, max: 40 },
    });
    expect(toAgentSearchFilters(filter, defaultTab.filters)).toEqual(
      defaultTab.filters
    );
    expect(toSkillSearchFilters(filter)).toEqual({
      activeUsersCount: { min: 5, max: 40 },
    });
  });
});

describe("getSearchFilterPresets", () => {
  const currentUser: UserType = {
    sId: "me",
    id: 1,
    createdAt: 0,
    provider: "google",
    username: "alice",
    email: "alice@example.com",
    firstName: "Alice",
    lastName: null,
    fullName: "Alice",
    image: null,
    pronouns: null,
    lastLoginAt: null,
  };

  it("offers Editor is Me when the editor category is listed", () => {
    expect(
      getSearchFilterPresets({
        categories: CATEGORIES,
        currentUser,
        t: translate,
      })
    ).toEqual([
      {
        category: "editor",
        categoryLabel: "Editor",
        options: [
          {
            category: "editor",
            id: "me",
            name: "Alice (You)",
            image: null,
            disabled: false,
          },
        ],
      },
    ]);
  });

  it("offers no preset when the category is not listed", () => {
    expect(
      getSearchFilterPresets({
        categories: ["model"],
        currentUser,
        t: translate,
      })
    ).toEqual([]);
  });
});
