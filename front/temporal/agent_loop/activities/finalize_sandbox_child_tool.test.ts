import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { finalizeErroredSandboxChildToolActivity } from "@app/temporal/agent_loop/activities/finalize_sandbox_child_tool";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/actions/types", () => ({
  isSandboxChildActionInfo: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: {
    fromJsonWithRefrehedGroups: vi.fn(),
  },
}));

vi.mock("@app/lib/resources/agent_mcp_action_resource", () => ({
  AgentMCPActionResource: {
    fetchByModelIdWithAuth: vi.fn(),
  },
}));

const authType: AuthenticatorType = {
  authMethod: "internal",
  groupIds: [],
  isByok: false,
  role: "admin",
  subscriptionId: null,
  userId: null,
  workspaceId: "w123",
};

describe("finalizeErroredSandboxChildToolActivity", () => {
  const auth = { workspaceId: "w123" };
  const updateStatusFromExpected = vi.fn();
  const action = {
    stepContext: {
      sandboxChildActionInfo: { parentActionId: "parent" },
    },
    updateStatusFromExpected,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Authenticator.fromJsonWithRefrehedGroups).mockResolvedValue(
      auth as never
    );
    vi.mocked(AgentMCPActionResource.fetchByModelIdWithAuth).mockResolvedValue(
      action as never
    );
    vi.mocked(isSandboxChildActionInfo).mockReturnValue(true);
  });

  it("moves only a running sandbox child action to errored", async () => {
    await finalizeErroredSandboxChildToolActivity(authType, {
      actionModelId: 123,
    });

    expect(updateStatusFromExpected).toHaveBeenCalledWith(auth, {
      expectedStatus: "running",
      status: "errored",
    });
  });

  it("ignores an action that is not a sandbox child", async () => {
    vi.mocked(isSandboxChildActionInfo).mockReturnValue(false);

    await finalizeErroredSandboxChildToolActivity(authType, {
      actionModelId: 123,
    });

    expect(updateStatusFromExpected).not.toHaveBeenCalled();
  });
});
