import type { SearchResult } from "@app/lib/api/search";
import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import {
  asyncIteratorFrom,
  parseSseDataPayloads,
} from "@front-api/tests/utils/sse";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleSearch, streamToolFiles } = vi.hoisted(() => ({
  handleSearch: vi.fn(),
  streamToolFiles: vi.fn(),
}));
vi.mock("@app/lib/api/search", () => ({ handleSearch }));
vi.mock("@app/lib/search/tools/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/search/tools/search")>()),
  streamToolFiles,
}));

const knowledgeResults: SearchResult = {
  nodes: [],
  warningCode: null,
  nextPageCursor: "next",
  resultsCount: 0,
};
const toolResult: ToolSearchResult = {
  externalId: "doc",
  title: "Document",
  mimeType: "text/plain",
  type: "document",
  sourceUrl: null,
  serverViewId: "server",
  serverName: "Search tool",
  serverIcon: "ActionListIcon",
};

beforeEach(() => {
  vi.clearAllMocks();
  handleSearch.mockResolvedValue(new Ok(knowledgeResults));
  streamToolFiles.mockImplementation(asyncIteratorFrom([[toolResult]]));
});

describe("GET /api/w/:wId/search", () => {
  it.each(["application/json", "text/event-stream"])(
    "serves negotiated %s search results",
    async (accept) => {
      const { workspace } = await createPrivateApiMockRequest();
      const response = await honoApp.request(
        `/api/w/${workspace.sId}/search?query=test`,
        { headers: { Accept: accept } }
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain(accept);
      expect(response.headers.get("Vary")).toContain("Accept");
      if (accept === "application/json") {
        expect(await response.json()).toEqual({
          knowledgeResults,
          toolResults: [toolResult],
        });
        expect(response.headers.get("Cache-Control")).toBe("no-store");
      } else {
        expect(
          parseSseDataPayloads(await response.text()).map((data) =>
            JSON.parse(data)
          )
        ).toEqual([{ knowledgeResults }, { toolResults: [toolResult] }]);
      }
    }
  );

  it("does not search tools again while paginating JSON results", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/search?query=test&cursor=next`,
      { headers: { Accept: "application/json" } }
    );
    expect(await response.json()).toEqual({
      knowledgeResults,
      toolResults: [],
    });
    expect(streamToolFiles).not.toHaveBeenCalled();
  });

  it("preserves HTTP search errors in JSON mode", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    const error = { type: "invalid_request_error", message: "Invalid cursor" };
    handleSearch.mockResolvedValue(new Err({ status: 400, error }));
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/search?query=test`,
      { headers: { Accept: "application/json" } }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(streamToolFiles).not.toHaveBeenCalled();
  });
});
