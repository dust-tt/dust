import { podFunctionsSkill } from "@app/lib/resources/skill/code_defined/global/pod_functions";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { describe, expect, it } from "vitest";

function agentLoopData({
  spaceId,
  hasConfiguredPod,
}: {
  spaceId: string | null;
  hasConfiguredPod: boolean;
}): AgentLoopExecutionData {
  return {
    agentConfiguration: {
      actions: [
        {
          dustProject: hasConfiguredPod
            ? { workspaceId: "w-id", projectId: "pod-id" }
            : null,
        },
      ],
    },
    conversation: { spaceId },
  } as unknown as AgentLoopExecutionData;
}

describe("podFunctionsSkill.isDisabledForAgentLoop", () => {
  it("keeps the skill in a pod conversation", () => {
    expect(
      podFunctionsSkill.isDisabledForAgentLoop(
        agentLoopData({ spaceId: "vlt_123", hasConfiguredPod: false })
      )
    ).toBe(false);
  });

  it("hides the skill outside a pod conversation when no pod is configured", () => {
    expect(
      podFunctionsSkill.isDisabledForAgentLoop(
        agentLoopData({ spaceId: null, hasConfiguredPod: false })
      )
    ).toBe(true);
  });

  it("keeps the skill outside a pod conversation when the agent has a configured pod", () => {
    expect(
      podFunctionsSkill.isDisabledForAgentLoop(
        agentLoopData({ spaceId: null, hasConfiguredPod: true })
      )
    ).toBe(false);
  });
});
