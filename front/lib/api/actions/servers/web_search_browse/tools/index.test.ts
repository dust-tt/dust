import type { StepContext } from "@app/lib/actions/types";
import { WEBSEARCH_ACTION_NUM_RESULTS } from "@app/lib/actions/utils";
import {
  AGENT_LESS_DEFAULT_WEBSEARCH_RESULT_COUNT,
  TOOLS,
} from "@app/lib/api/actions/servers/web_search_browse/tools/index";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { webSearch } from "@app/lib/utils/websearch";
import {
  makeExtra,
  setupPlainConversation,
} from "@app/tests/utils/conversation_test_factories";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/utils/websearch", () => ({
  webSearch: vi.fn(),
}));

function makeStepContext(websearchResultCount: number): StepContext {
  return {
    citationsCount: websearchResultCount,
    citationsOffset: 0,
    resumeState: null,
    retrievalTopK: 0,
    websearchResultCount,
  };
}

describe("websearch tool", () => {
  let auth: Authenticator;
  let conversation: ConversationResource;

  beforeEach(async () => {
    ({ auth, conversation } = await setupPlainConversation());
    vi.mocked(webSearch).mockResolvedValue(new Ok([]));
  });

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
      makeExtra(auth, conversation, {
        stepContext: makeStepContext(WEBSEARCH_ACTION_NUM_RESULTS),
      })
    );

    expect(result.isOk()).toBe(true);
    expect(webSearch).toHaveBeenCalledWith(
      expect.objectContaining({ num: WEBSEARCH_ACTION_NUM_RESULTS })
    );
  });

  it("falls back to the default when the step context carries a zero count", async () => {
    const result = await getWebsearchTool().handler(
      { query: "dust" },
      makeExtra(auth, conversation, { stepContext: makeStepContext(0) })
    );

    expect(result.isOk()).toBe(true);
    expect(webSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        num: AGENT_LESS_DEFAULT_WEBSEARCH_RESULT_COUNT,
      })
    );
  });
});
