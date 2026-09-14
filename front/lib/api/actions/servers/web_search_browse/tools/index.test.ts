import { WEBSEARCH_ACTION_NUM_RESULTS } from "@app/lib/actions/utils";
import {
  AGENT_LESS_DEFAULT_WEBSEARCH_RESULT_COUNT,
  TOOLS,
} from "@app/lib/api/actions/servers/web_search_browse/tools/index";
import type { Authenticator } from "@app/lib/auth";
import { webSearch } from "@app/lib/utils/websearch";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/utils/websearch", () => ({
  webSearch: vi.fn(),
}));

describe("websearch tool", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    vi.mocked(webSearch).mockResolvedValue(new Ok([]));
  });

  function makeExtra(websearchResultCount: number) {
    return {
      auth,
      runContext: {
        contextType: "agent_loop",
        stepContext: {
          citationsCount: websearchResultCount,
          citationsOffset: 0,
          resumeState: null,
          retrievalTopK: 0,
          websearchResultCount,
        },
      },
      signal: new AbortController().signal,
    } as never;
  }

  function getWebsearchTool() {
    const tool = TOOLS.find((t) => t.name === "websearch");
    if (!tool) {
      throw new Error("websearch tool not found");
    }
    return tool;
  }

  it("forwards the step context result count to the provider", async () => {
    const result = await getWebsearchTool().handler(
      { query: "dust" },
      makeExtra(WEBSEARCH_ACTION_NUM_RESULTS)
    );

    expect(result.isOk()).toBe(true);
    expect(webSearch).toHaveBeenCalledWith(
      expect.objectContaining({ num: WEBSEARCH_ACTION_NUM_RESULTS })
    );
  });

  it("falls back to the default when the step context carries a zero count", async () => {
    const result = await getWebsearchTool().handler(
      { query: "dust" },
      makeExtra(0)
    );

    expect(result.isOk()).toBe(true);
    expect(webSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        num: AGENT_LESS_DEFAULT_WEBSEARCH_RESULT_COUNT,
      })
    );
  });
});
