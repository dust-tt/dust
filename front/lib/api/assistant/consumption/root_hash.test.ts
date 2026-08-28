import {
  applyConsumptionExecutionTotal,
  readConsumptionExecutionTotal,
  readConsumptionRootRevision,
  readConsumptionRootTotals,
  seedConsumptionRootTotals,
} from "@app/lib/api/assistant/consumption/root_hash";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { beforeEach, describe, expect, it } from "vitest";

const WORKSPACE_ID = "ws1";
const RUN_KEY = "run-x";
const ROOT_AGENT_MESSAGE_ID = "msg-root";

async function applyTotal({
  totalCreditAmountMicro,
  runKey = RUN_KEY,
  subagentAgentMessageId = null,
}: {
  totalCreditAmountMicro: number;
  runKey?: string;
  subagentAgentMessageId?: number | null;
}): Promise<void> {
  return applyConsumptionExecutionTotal({
    workspaceId: WORKSPACE_ID,
    runKey,
    rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
    totalCreditAmountMicro,
    subagentAgentMessageId,
  });
}

describe("consumption root projection", () => {
  beforeEach(async () => {
    redisMock.reset();
    await seedConsumptionRootTotals({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      expectedRevision: 0,
      totals: { totalCreditAmountMicro: 0, subagentCount: 0 },
      executionCreditAmountMicroByRunKey: new Map(),
    });
  });

  it("replaces an execution total and adjusts the root by the difference", async () => {
    await applyTotal({ totalCreditAmountMicro: 1_000_000 });
    await applyTotal({ totalCreditAmountMicro: 1_400_000 });

    expect(
      await readConsumptionRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).toEqual({ totalCreditAmountMicro: 1_400_000, subagentCount: 0 });
    expect(
      await readConsumptionExecutionTotal({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        runKey: RUN_KEY,
      })
    ).toBe(1_400_000);
  });

  it("safely replaces an execution total when an outbox event is replayed", async () => {
    await applyTotal({ totalCreditAmountMicro: 2_000_000 });
    await applyTotal({ totalCreditAmountMicro: 9_000_000 });
    await applyTotal({ totalCreditAmountMicro: 9_000_000 });
    expect(
      await readConsumptionRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).toEqual({ totalCreditAmountMicro: 9_000_000, subagentCount: 0 });
  });

  it("counts one sub-agent message once across resumed executions", async () => {
    await applyTotal({
      totalCreditAmountMicro: 0,
      subagentAgentMessageId: 101,
      runKey: "first-execution",
    });
    await applyTotal({
      totalCreditAmountMicro: 0,
      subagentAgentMessageId: 101,
      runKey: "resumed-execution",
    });

    expect(
      await readConsumptionRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).toEqual({ totalCreditAmountMicro: 0, subagentCount: 1 });
  });

  it("seeds a missing root without overwriting live totals", async () => {
    redisMock.reset();
    await seedConsumptionRootTotals({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      expectedRevision: 0,
      totals: { totalCreditAmountMicro: 4_000_000, subagentCount: 3 },
      executionCreditAmountMicroByRunKey: new Map([[RUN_KEY, 4_000_000]]),
    });
    await seedConsumptionRootTotals({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      expectedRevision: 0,
      totals: { totalCreditAmountMicro: 9_000_000, subagentCount: 7 },
      executionCreditAmountMicroByRunKey: new Map([[RUN_KEY, 9_000_000]]),
    });

    expect(
      await readConsumptionRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).toEqual({ totalCreditAmountMicro: 4_000_000, subagentCount: 3 });
    expect(
      await readConsumptionExecutionTotal({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        runKey: RUN_KEY,
      })
    ).toBe(4_000_000);
  });

  it("rejects a stale rebuild after an execution changed", async () => {
    redisMock.reset();
    await applyTotal({ totalCreditAmountMicro: 1_000_000 });

    expect(
      await readConsumptionRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).toBeNull();
    await expect(
      seedConsumptionRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        expectedRevision: 0,
        totals: { totalCreditAmountMicro: 0, subagentCount: 0 },
        executionCreditAmountMicroByRunKey: new Map(),
      })
    ).resolves.toBe(false);

    const revision = await readConsumptionRootRevision({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
    });
    await expect(
      seedConsumptionRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        expectedRevision: revision,
        totals: { totalCreditAmountMicro: 1_000_000, subagentCount: 0 },
        executionCreditAmountMicroByRunKey: new Map([[RUN_KEY, 1_000_000]]),
      })
    ).resolves.toBe(true);
  });
});
