import {
  buildCatalogQuery,
  interleaveCatalogItems,
} from "@app/components/assistant/conversation/discover/catalog";
import { getCatalogPageRequest } from "@app/components/assistant/conversation/discover/useCatalogSearch";
import { describe, expect, it } from "vitest";

describe("DiscoverCatalog", () => {
  it("preserves each endpoint rank when combining search results", () => {
    expect(
      interleaveCatalogItems(
        ["agent-1", "agent-2", "agent-3"],
        ["skill-1", "skill-2"]
      )
    ).toEqual(["agent-1", "skill-1", "agent-2", "skill-2", "agent-3"]);
  });

  it("splits the page between agents and skills in the combined view", () => {
    const query = buildCatalogQuery(
      { view: "all", kind: "all", tagId: null },
      ""
    );
    expect(query.showAgents).toBe(true);
    expect(query.showSkills).toBe(true);
    expect(query.limit).toBe(25);
    expect(getCatalogPageRequest(query, null)).toMatchObject({
      agents: { cursor: null },
      skills: { cursor: null },
    });
  });

  it("excludes skills and uses the full page when filtering by a tag", () => {
    const query = buildCatalogQuery(
      { view: "all", kind: "all", tagId: "tag-1" },
      ""
    );
    expect(query.showSkills).toBe(false);
    expect(query.agentFilters).toEqual({ tagIds: ["tag-1"] });
    expect(query.limit).toBe(50);
    expect(getCatalogPageRequest(query, null)).toMatchObject({
      agents: { cursor: null },
      skills: null,
    });
  });

  it("changes the query key whenever a filter or the search changes", () => {
    const base = { view: "all", kind: "all", tagId: null } as const;
    const keyOf = (filters: Parameters<typeof buildCatalogQuery>[0]) =>
      buildCatalogQuery(filters, "").key;

    expect(keyOf(base)).toBe(keyOf({ ...base }));
    expect(keyOf({ ...base, kind: "agent" })).not.toBe(keyOf(base));
    expect(keyOf({ ...base, view: "mine" })).not.toBe(keyOf(base));
    expect(keyOf({ ...base, tagId: "tag-1" })).not.toBe(keyOf(base));
    expect(buildCatalogQuery(base, "sales").key).not.toBe(keyOf(base));
  });

  it("stops fetching a source after its cursor is exhausted", () => {
    const query = buildCatalogQuery(
      { view: "all", kind: "all", tagId: null },
      ""
    );
    const request = getCatalogPageRequest(query, {
      items: [],
      next: { agents: null, skills: "next-skill" },
    });

    expect(request?.agents).toBeNull();
    expect(request?.skills).toEqual({ cursor: "next-skill" });
    expect(
      getCatalogPageRequest(query, {
        items: [],
        next: { agents: null, skills: null },
      })
    ).toBeNull();
  });
});
