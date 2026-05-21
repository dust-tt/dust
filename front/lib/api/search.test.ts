import type { Authenticator } from "@app/lib/auth";
import { CoreAPI } from "@app/types/core/core_api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleSearch } from "./search";

const { searchNodesMock } = vi.hoisted(() => ({
  searchNodesMock: vi.fn(),
}));

function ok<T>(value: T) {
  return {
    isErr: () => false,
    value,
  };
}

vi.mock("@app/lib/api/config", () => ({
  default: {
    getCoreAPIConfig: vi.fn(() => ({})),
  },
}));

vi.mock("@app/lib/api/content_nodes", () => ({
  getContentNodeFromCoreNode: vi.fn(),
  NON_REMOTE_DATABASE_TABLE_MIME_TYPES: [],
  NON_SEARCHABLE_NODES_MIME_TYPES: [],
}));

vi.mock("@app/lib/api/pagination", () => ({
  getCursorPaginationParams: vi.fn(() => ok(null)),
}));

vi.mock("@app/lib/resources/data_source_view_resource", () => ({
  DataSourceViewResource: {
    listBySpaces: vi.fn(() => Promise.resolve([{}])),
  },
}));

vi.mock("@app/lib/resources/space_resource", () => ({
  SpaceResource: {
    listWorkspaceSpacesAsMember: vi.fn(() =>
      Promise.resolve([{ sId: "space-1" }])
    ),
  },
}));

vi.mock("@app/lib/search", () => ({
  getSearchFilterFromDataSourceViews: vi.fn(() => ok({})),
}));

vi.mock("@app/logger/logger", () => ({
  default: {},
}));

vi.mock("@app/types/core/core_api", () => ({
  CoreAPI: vi.fn().mockImplementation(function () {
    return {
      searchNodes: searchNodesMock,
    };
  }),
}));

describe("handleSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchNodesMock.mockResolvedValue(
      ok({
        hit_count: 0,
        next_page_cursor: null,
        nodes: [],
        warning_code: null,
      })
    );
  });

  it("normalizes GitHub URL source searches before querying Core", async () => {
    const result = await handleSearch({}, {} as Authenticator, {
      includeDataSources: true,
      limit: 10,
      query:
        "https://github.com/dust-tt/decisions/issues/797#issuecomment-4325601982",
      searchSourceUrls: true,
      viewType: "all",
    });

    expect(result.isErr()).toBe(false);
    expect(CoreAPI).toHaveBeenCalledTimes(1);
    expect(searchNodesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "https://github.com/dust-tt/decisions/issues/797",
      })
    );
  });
});
