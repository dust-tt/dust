import type { ExecutionBill } from "@app/lib/api/assistant/consumption/bill";
import { emitAgentMessageUsageEvent } from "@app/lib/api/assistant/consumption/usage_event";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchUsageContext: vi.fn(),
  ingestMetronomeEvents: vi.fn(),
}));

vi.mock("@app/lib/metronome/client", () => ({
  ingestMetronomeEvents: mocks.ingestMetronomeEvents,
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchAgentMessageUsageEventContext: mocks.fetchUsageContext,
  },
}));

const bill = {
  eventCreditAmount: 12,
  costCredits: 12,
  userMessageOrigin: "web",
  runUsageModelIds: [],
  actionModelIds: [],
} satisfies ExecutionBill;

describe("emitAgentMessageUsageEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips only Metronome emission for an unprovisioned workspace", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    expect(workspace.metronomeCustomerId).toBeNull();

    await emitAgentMessageUsageEvent(auth, {
      agentMessageId: "agent-message",
      bill,
      runKey: "execution",
      rootAgentMessageId: "root-agent-message",
      status: "succeeded",
      timestamp: "2026-09-18T08:00:00.000Z",
    });

    expect(mocks.fetchUsageContext).not.toHaveBeenCalled();
    expect(mocks.ingestMetronomeEvents).not.toHaveBeenCalled();
  });
});
