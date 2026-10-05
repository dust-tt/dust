import type { CatalogItem } from "@app/components/assistant/conversation/discover/catalog";
import {
  trackDiscoverItemDetailsOpen,
  trackDiscoverItemSelect,
  trackDiscoverySuggestionClick,
  trackDiscoverySuggestionView,
  trackHomepageUseCaseClick,
  trackHomepageUseCaseView,
} from "@app/components/assistant/conversation/discover/discoveryTracking";
import { trackEvent } from "@app/lib/tracking";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/tracking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/tracking")>();
  return { ...actual, trackEvent: vi.fn() };
});

const trackEventMock = vi.mocked(trackEvent);

beforeEach(() => {
  trackEventMock.mockClear();
});

describe("discoveryTracking", () => {
  it("names the homepage use case on click and view", () => {
    trackHomepageUseCaseView({ useCaseId: "meeting-prep" });
    trackHomepageUseCaseClick({ useCaseId: "meeting-prep" });

    expect(trackEventMock).toHaveBeenNthCalledWith(1, {
      area: "discover",
      object: "homepage_use_case",
      action: "view",
      extra: { use_case_id: "meeting-prep" },
    });
    expect(trackEventMock).toHaveBeenNthCalledWith(2, {
      area: "discover",
      object: "homepage_use_case",
      action: "click",
      extra: { use_case_id: "meeting-prep" },
    });
  });

  it("names the surfaced For You or Trending item on click and view", () => {
    trackDiscoverySuggestionView({
      section: "for_you",
      itemKind: "skill",
      itemId: "skill_123",
    });
    trackDiscoverySuggestionClick({
      section: "trending",
      itemKind: "agent",
      itemId: "agent_456",
    });

    expect(trackEventMock).toHaveBeenNthCalledWith(1, {
      area: "discover",
      object: "discovery_suggestion",
      action: "view",
      extra: {
        section: "for_you",
        item_kind: "skill",
        item_id: "skill_123",
      },
    });
    expect(trackEventMock).toHaveBeenNthCalledWith(2, {
      area: "discover",
      object: "discovery_suggestion",
      action: "click",
      extra: {
        section: "trending",
        item_kind: "agent",
        item_id: "agent_456",
      },
    });
  });

  it("names the source and item on select and details open", () => {
    const item: CatalogItem = {
      kind: "skill",
      skill: {
        sId: "skill_123",
        name: "Skill",
        icon: null,
        userFacingDescription: "",
      },
      authors: [],
      isDustProvided: false,
      activeUsersCount: null,
    };

    trackDiscoverItemSelect({ source: "featured", item });
    trackDiscoverItemDetailsOpen({
      source: "catalog",
      item,
      catalog: {
        view: "popular",
        kind: "all",
        tagId: "tag_1",
        hasSearchTerm: true,
      },
    });

    expect(trackEventMock).toHaveBeenNthCalledWith(1, {
      area: "discover",
      object: "item",
      action: "select",
      extra: {
        source: "featured",
        item_kind: "skill",
        item_id: "skill_123",
        is_dust_provided: false,
      },
    });
    expect(trackEventMock).toHaveBeenNthCalledWith(2, {
      area: "discover",
      object: "item_details",
      action: "open",
      extra: {
        source: "catalog",
        item_kind: "skill",
        item_id: "skill_123",
        is_dust_provided: false,
        catalog_view: "popular",
        catalog_kind: "all",
        catalog_has_search_term: true,
        catalog_tag_id: "tag_1",
      },
    });
  });
});
