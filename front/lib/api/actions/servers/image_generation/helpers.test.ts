import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { IMAGE_MODEL_IDS } from "@app/types/assistant/models/models";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRateLimiter } = vi.hoisted(() => {
  return {
    mockRateLimiter: vi.fn(),
  };
});

vi.mock("@app/lib/utils/rate_limiter", () => ({
  rateLimiter: mockRateLimiter,
}));

import {
  checkImageGenerationRateLimit,
  recordImageGenerationRunUsage,
} from "@app/lib/api/actions/servers/image_generation/helpers";

describe("checkImageGenerationRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiter.mockResolvedValue(1);
  });

  it("skips the rate limiter entirely on credit-priced plans", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await checkImageGenerationRateLimit(
      auth,
      workspace,
      "openai"
    );

    expect(result.isOk()).toBe(true);
    expect(mockRateLimiter).not.toHaveBeenCalled();
  });

  it("enforces the plan weekly cap on legacy plans", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const { maxImagesPerWeek } =
      auth.getNonNullablePlan().limits.capabilities.images;

    const result = await checkImageGenerationRateLimit(
      auth,
      workspace,
      "openai"
    );

    expect(result.isOk()).toBe(true);
    expect(mockRateLimiter).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `image_generation_${workspace.sId}`,
        maxPerTimeframe: maxImagesPerWeek,
      })
    );
  });

  it("returns an error when the weekly cap is exhausted on legacy plans", async () => {
    mockRateLimiter.mockResolvedValue(0);

    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await checkImageGenerationRateLimit(
      auth,
      workspace,
      "openai"
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("requests per week exceeded");
    }
  });
});

describe("recordImageGenerationRunUsage", () => {
  it("records a run usage for the image model", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const dustRunId = await recordImageGenerationRunUsage(auth, {
      usageMetadata: { inputTokens: 100, outputTokens: 1000 },
      modelId: IMAGE_MODEL_IDS[0],
      providerId: "google_ai_studio",
      actionId: null,
    });

    const run = await RunResource.fetchByDustRunId(auth, { dustRunId });
    assert(run, "Run not found");

    const usages = await run.listRunUsages(auth);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({
      modelId: IMAGE_MODEL_IDS[0],
      providerId: "google_ai_studio",
      promptTokens: 100,
      completionTokens: 1000,
      isBatch: false,
    });
    expect(usages[0].costMicroUsd).toBeGreaterThan(0);
  });

  it("attaches the run to the action's stepContext", async () => {
    const { workspace, authenticator: auth } = await createResourceTest({});

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
    const { action } = await AgentMCPActionFactory.createWithAgentMessage(
      auth,
      { workspace, conversation }
    );

    const dustRunId = await recordImageGenerationRunUsage(auth, {
      usageMetadata: { inputTokens: 100, outputTokens: 1000 },
      modelId: IMAGE_MODEL_IDS[0],
      providerId: "google_ai_studio",
      actionId: action.id,
    });

    const refreshedAction = await AgentMCPActionResource.fetchByModelIdWithAuth(
      auth,
      action.id
    );
    assert(refreshedAction, "Action not found");
    expect(refreshedAction.stepContext.runIds).toEqual([dustRunId]);
    // Pre-existing stepContext fields are preserved.
    expect(refreshedAction.stepContext.retrievalTopK).toBe(
      action.stepContext.retrievalTopK
    );
  });
});
