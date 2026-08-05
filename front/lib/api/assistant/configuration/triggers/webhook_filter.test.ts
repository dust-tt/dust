import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getWebhookFilterGeneration } from "@app/lib/api/assistant/configuration/triggers/webhook_filter";
import { getLargeWhitelistedModel } from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import type { WebhookEvent } from "@app/types/triggers/webhooks_source_preset";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/call_llm", () => ({
  runMultiActionsAgent: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/models", () => ({
  getLargeWhitelistedModel: vi.fn(),
}));

const mockRunMultiActionsAgent = vi.mocked(runMultiActionsAgent);
const mockGetLargeWhitelistedModel = vi.mocked(getLargeWhitelistedModel);

const event: WebhookEvent = {
  name: "test.event",
  value: "test.event",
  description: "A test event",
  schema: {
    type: "object",
    properties: {
      status: { type: "string" },
      count: { type: "integer" },
    },
  },
  sample: {
    status: "open",
    count: 1,
  },
};

function mockFilterGeneration(filter: string): void {
  mockRunMultiActionsAgent.mockResolvedValueOnce(
    new Ok({
      actions: [
        {
          name: "set_filter",
          arguments: { filter },
        },
      ],
    }) as never
  );
}

describe("getWebhookFilterGeneration", () => {
  let authenticator: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetLargeWhitelistedModel.mockReturnValue({
      modelId: "test-model",
      providerId: "openai",
    } as never);
    const testResources = await createResourceTest({ role: "admin" });
    authenticator = testResources.authenticator;
  });

  it("returns a valid filter without retrying", async () => {
    mockFilterGeneration('(eq "status" "open")');

    const result = await getWebhookFilterGeneration(authenticator, {
      naturalDescription: "Status is open",
      event,
      providerSpecificInstructions: null,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.filter).toBe('(eq "status" "open")');
    }
    expect(mockRunMultiActionsAgent).toHaveBeenCalledOnce();
  });

  it("repairs an invalid generated filter once", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    mockFilterGeneration('(has-any "status" ("open" "closed"))');
    mockFilterGeneration('(or (eq "status" "open") (eq "status" "closed"))');

    const result = await getWebhookFilterGeneration(authenticator, {
      naturalDescription: "Status is open or closed",
      event,
      providerSpecificInstructions: null,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.filter).toBe(
        '(or (eq "status" "open") (eq "status" "closed"))'
      );
    }
    expect(mockRunMultiActionsAgent).toHaveBeenCalledTimes(2);
    const repairInput = mockRunMultiActionsAgent.mock.calls[1][2];
    expect(JSON.stringify(repairInput.conversation)).toContain(
      'Operator \\"has-any\\" requires an array field'
    );
    expect(warnSpy).toHaveBeenCalledWith(
      {
        workspaceId: authenticator.getNonNullableWorkspace().sId,
        webhookEvent: event.value,
        error: expect.objectContaining({
          message:
            'Operator "has-any" requires an array field, but "status" is string.',
        }),
      },
      "Generated webhook filter failed validation, retrying"
    );
    warnSpy.mockRestore();
  });

  it("returns the repaired filter without validating it again", async () => {
    mockFilterGeneration('(has-any "status" ("open" "closed"))');
    mockFilterGeneration('(contains "count" "1")');

    const result = await getWebhookFilterGeneration(authenticator, {
      naturalDescription: "Status is open or closed",
      event,
      providerSpecificInstructions: null,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.filter).toBe('(contains "count" "1")');
    }
    expect(mockRunMultiActionsAgent).toHaveBeenCalledTimes(2);
  });
});
