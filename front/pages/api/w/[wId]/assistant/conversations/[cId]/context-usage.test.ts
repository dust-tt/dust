import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { SupportedModel } from "@app/types/assistant/models/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import handler from "./context-usage";

const MODEL: SupportedModel = {
  providerId: "anthropic",
  modelId: "claude-haiku-4-5-20251001",
};

function makeRunUsage({
  promptTokens,
  completionTokens,
}: {
  promptTokens: number;
  completionTokens: number;
}): RunUsageType {
  return {
    providerId: MODEL.providerId,
    modelId: MODEL.modelId,
    promptTokens,
    completionTokens,
    cachedTokens: null,
    cacheCreationTokens: null,
    costMicroUsd: 1,
    isBatch: false,
  };
}

function makeRunWithUsages(usages: RunUsageType[]) {
  return {
    listRunUsages: vi.fn().mockResolvedValue(usages),
  };
}

function makeConversationResource({
  latestAgentMessageRun,
  latestCompactionMessageRun,
  previousAgentMessageRun = null,
}: {
  latestAgentMessageRun: {
    rank: number;
    run: ReturnType<typeof makeRunWithUsages>;
  } | null;
  latestCompactionMessageRun: {
    rank: number;
    run: ReturnType<typeof makeRunWithUsages>;
  } | null;
  previousAgentMessageRun?: {
    rank: number;
    run: ReturnType<typeof makeRunWithUsages>;
  } | null;
}) {
  return {
    getLatestAgentMessageRun: vi
      .fn()
      .mockResolvedValueOnce(latestAgentMessageRun)
      .mockResolvedValueOnce(previousAgentMessageRun),
    getLatestCompactionMessageRun: vi
      .fn()
      .mockResolvedValue(latestCompactionMessageRun),
  } satisfies Pick<
    ConversationResource,
    "getLatestAgentMessageRun" | "getLatestCompactionMessageRun"
  >;
}

async function setupTest() {
  const { req, res, workspace } = await createPrivateApiMockRequest({
    role: "admin",
    method: "GET",
  });

  req.query.wId = workspace.sId;
  req.query.cId = "conversation_sid";
  req.url = `/api/w/${workspace.sId}/assistant/conversations/conversation_sid/context-usage`;

  return { req, res };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/w/[wId]/assistant/conversations/[cId]/context-usage", () => {
  it("uses the latest succeeded compaction run when it is newer than the latest agent run", async () => {
    const { req, res } = await setupTest();

    const agentRun = makeRunWithUsages([
      makeRunUsage({ promptTokens: 111, completionTokens: 11 }),
    ]);
    const compactionRun = makeRunWithUsages([
      makeRunUsage({ promptTokens: 222, completionTokens: 123 }),
    ]);
    const conversation = makeConversationResource({
      latestAgentMessageRun: {
        rank: 10,
        run: agentRun,
      },
      latestCompactionMessageRun: {
        rank: 20,
        run: compactionRun,
      },
    });

    vi.spyOn(ConversationResource, "fetchById").mockResolvedValue(
      conversation as unknown as ConversationResource
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      model: MODEL,
      contextUsage: 123,
    });
    expect(agentRun.listRunUsages).not.toHaveBeenCalled();
    expect(compactionRun.listRunUsages).toHaveBeenCalledOnce();
  });

  it("uses the latest agent run when it is newer than the latest succeeded compaction run", async () => {
    const { req, res } = await setupTest();

    const agentRun = makeRunWithUsages([
      makeRunUsage({ promptTokens: 222, completionTokens: 22 }),
    ]);
    const compactionRun = makeRunWithUsages([
      makeRunUsage({ promptTokens: 111, completionTokens: 77 }),
    ]);
    const conversation = makeConversationResource({
      latestAgentMessageRun: {
        rank: 20,
        run: agentRun,
      },
      latestCompactionMessageRun: {
        rank: 10,
        run: compactionRun,
      },
    });

    vi.spyOn(ConversationResource, "fetchById").mockResolvedValue(
      conversation as unknown as ConversationResource
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      model: MODEL,
      contextUsage: 222,
    });
    expect(compactionRun.listRunUsages).not.toHaveBeenCalled();
    expect(agentRun.listRunUsages).toHaveBeenCalledOnce();
  });

  it("returns pending usage when the latest compaction run has no usage rows yet", async () => {
    const { req, res } = await setupTest();

    const agentRun = makeRunWithUsages([
      makeRunUsage({ promptTokens: 111, completionTokens: 11 }),
    ]);
    const compactionRun = makeRunWithUsages([]);
    const conversation = makeConversationResource({
      latestAgentMessageRun: {
        rank: 10,
        run: agentRun,
      },
      latestCompactionMessageRun: {
        rank: 20,
        run: compactionRun,
      },
    });

    vi.spyOn(ConversationResource, "fetchById").mockResolvedValue(
      conversation as unknown as ConversationResource
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      model: null,
      contextUsage: null,
      contextSize: null,
    });
    expect(agentRun.listRunUsages).not.toHaveBeenCalled();
    expect(compactionRun.listRunUsages).toHaveBeenCalledOnce();
  });

  it("falls back to the previous agent run when the latest has no usage rows yet", async () => {
    const { req, res } = await setupTest();

    const latestRun = makeRunWithUsages([]);
    const previousRun = makeRunWithUsages([
      makeRunUsage({ promptTokens: 555, completionTokens: 55 }),
    ]);
    const conversation = makeConversationResource({
      latestAgentMessageRun: { rank: 20, run: latestRun },
      latestCompactionMessageRun: null,
      previousAgentMessageRun: { rank: 18, run: previousRun },
    });

    vi.spyOn(ConversationResource, "fetchById").mockResolvedValue(
      conversation as unknown as ConversationResource
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      model: MODEL,
      contextUsage: 555,
    });
    expect(latestRun.listRunUsages).toHaveBeenCalledOnce();
    expect(previousRun.listRunUsages).toHaveBeenCalledOnce();
    expect(conversation.getLatestAgentMessageRun).toHaveBeenCalledTimes(2);
    expect(conversation.getLatestAgentMessageRun).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { maxRank: 19 }
    );
  });

  it("returns pending usage when the latest agent run has no usage rows and there is no previous run", async () => {
    const { req, res } = await setupTest();

    const agentRun = makeRunWithUsages([]);
    const conversation = makeConversationResource({
      latestAgentMessageRun: { rank: 20, run: agentRun },
      latestCompactionMessageRun: null,
      // previousAgentMessageRun defaults to null — first message in the conversation
    });

    vi.spyOn(ConversationResource, "fetchById").mockResolvedValue(
      conversation as unknown as ConversationResource
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      model: null,
      contextUsage: null,
      contextSize: null,
    });
    expect(agentRun.listRunUsages).toHaveBeenCalledOnce();
    expect(conversation.getLatestAgentMessageRun).toHaveBeenCalledTimes(2);
  });

  it("returns pending usage when the conversation has no run data yet", async () => {
    const { req, res } = await setupTest();

    const conversation = makeConversationResource({
      latestAgentMessageRun: null,
      latestCompactionMessageRun: null,
    });

    vi.spyOn(ConversationResource, "fetchById").mockResolvedValue(
      conversation as unknown as ConversationResource
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      model: null,
      contextUsage: null,
      contextSize: null,
    });
  });
});
