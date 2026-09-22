import { useSubmitMessage } from "@app/hooks/useSubmitMessage";
import { LightUserFactory } from "@app/tests/utils/LightUserFactory";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientFetch: vi.fn(),
  resumeOngoingAgentLoopsPolling: vi.fn(),
}));

vi.mock("@app/lib/context/clientType", () => ({
  useClientType: () => "web",
}));

vi.mock("@app/lib/egress/client", () => ({
  clientFetch: mocks.clientFetch,
}));

vi.mock("@app/lib/swr/ongoing_agent_loops", () => ({
  useResumeOngoingAgentLoopsPolling: () => mocks.resumeOngoingAgentLoopsPolling,
}));

const owner = LightWorkspaceFactory.build({ sId: "w_1" });
const user = LightUserFactory.build({ sId: "u_1" });

describe("useSubmitMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {},
          contentFragments: [],
          agentMessages: [],
        }),
        { status: 200 }
      )
    );
  });

  it("resumes active polling after submitting a message", async () => {
    const { result } = renderHook(() =>
      useSubmitMessage({ owner, user, conversationId: "conv_1" })
    );

    await act(async () => {
      await result.current({
        input: "Hello",
        mentions: [],
        contentFragments: { uploaded: [], contentNodes: [] },
      });
    });

    expect(mocks.resumeOngoingAgentLoopsPolling).toHaveBeenCalledOnce();
  });
});
