import { planModeSkill } from "@app/lib/resources/skill/code_defined/system/plan_mode";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { AgenticMessageData } from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

function agentLoopDataWithUserMessage(
  agenticMessageData?: AgenticMessageData
): AgentLoopExecutionData {
  return {
    userMessage: { agenticMessageData },
  } as unknown as AgentLoopExecutionData;
}

describe("planModeSkill.isDisabledForAgentLoop", () => {
  it("keeps plan mode for top-level user messages", () => {
    expect(
      planModeSkill.isDisabledForAgentLoop(agentLoopDataWithUserMessage())
    ).toBe(false);
  });

  it.each([
    "run_agent",
    "agent_handover",
  ] as const)("disables plan mode for %s child runs", (type) => {
    expect(
      planModeSkill.isDisabledForAgentLoop(
        agentLoopDataWithUserMessage({ type, originMessageId: "msg" })
      )
    ).toBe(true);
  });
});
