import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { LightWorkspaceType } from "@app/types/user";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MCPServerPersonalAuthenticationRequired } from "./MCPServerPersonalAuthenticationRequired";

const createPersonalConnectionMock = vi.fn();
const resolveAuthenticationMock = vi.fn();
const removeCompletedActionMock = vi.fn();

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ user: { sId: "user_1" } }),
}));

vi.mock(
  "@app/components/assistant/conversation/BlockedActionsProvider",
  () => ({
    useBlockedActionsContext: () => ({
      removeCompletedAction: removeCompletedActionMock,
    }),
  })
);

vi.mock("@app/lib/swr/mcp_servers", () => ({
  useCreatePersonalConnection: () => ({
    createPersonalConnection: createPersonalConnectionMock,
  }),
  useMCPServer: () => ({
    server: {
      sId: "mcp_1",
      name: "GitHub",
      icon: undefined,
      authorization: {
        provider: "github",
        supported_use_cases: ["personal_actions"],
      },
    },
  }),
}));

vi.mock("@app/hooks/useResolveAuthentication", () => ({
  useResolveAuthentication: () => ({
    resolveAuthentication: resolveAuthenticationMock,
    isResolving: false,
  }),
}));

vi.mock("@app/lib/actions/mcp_helper", () => ({
  getMcpServerDisplayName: (server: { name: string }) => server.name,
}));

vi.mock("@app/lib/api/assistant/conversation/can_current_user_respond", () => ({
  canCurrentUserRespondToParentUserMessage: () => true,
}));

vi.mock("@app/components/resources/resources_icons", () => ({
  getAvatarFromIcon: () => null,
}));

vi.mock("@app/components/oauth/PersonalAuthCredentialOverrides", () => ({
  areCredentialOverridesValid: () => true,
  PersonalAuthCredentialOverrides: () => null,
}));

vi.mock("@app/types/oauth/lib", () => ({
  getOverridablePersonalAuthInputs: () => null,
}));

vi.mock("@dust-tt/sparkle", () => ({
  ActionCardBlock: ({
    title,
    description,
    actions,
  }: {
    title: string;
    description?: React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
      <div>{actions}</div>
    </div>
  ),
  Button: ({
    label,
    onClick,
    disabled,
  }: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
  Check: () => null,
  XClose: () => null,
}));

const owner: LightWorkspaceType = {
  id: 1,
  sId: "w_1",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

function makeBlockedAction(): BlockedToolExecution & {
  status: "blocked_authentication_required";
} {
  return {
    conversationId: "conv_1",
    messageId: "msg_1",
    actionId: "action_1",
    userId: "user_1",
    configurationId: "config_1",
    created: 1,
    inputs: {},
    metadata: {
      toolName: "tool",
      mcpServerName: "server",
      agentName: "agent",
      mcpServerId: "mcp_1",
      mcpServerDisplayName: "GitHub",
    },
    status: "blocked_authentication_required",
    authorizationInfo: {
      provider: "github",
      supported_use_cases: ["personal_actions"],
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderCard() {
  return render(
    <MCPServerPersonalAuthenticationRequired
      blockedAction={makeBlockedAction()}
      triggeringUser={null}
      owner={owner}
      mcpServerId="mcp_1"
      provider="github"
    />
  );
}

function outcomesPassedToResolve(): Array<string> {
  return resolveAuthenticationMock.mock.calls.map((call) => call[0].outcome);
}

describe("MCPServerPersonalAuthenticationRequired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPersonalConnectionMock.mockResolvedValue({ success: true });
    resolveAuthenticationMock.mockResolvedValue({ success: true });
  });

  it("resolves the action as completed on a successful connection", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: /Connect/i }));

    expect(outcomesPassedToResolve()).toContain("completed");
    expect(removeCompletedActionMock).toHaveBeenCalledWith("action_1");
  });

  it("keeps Skip enabled while a connection attempt is in flight", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ success: boolean }>();
    createPersonalConnectionMock.mockReturnValue(pending.promise);

    renderCard();

    await user.click(screen.getByRole("button", { name: /Connect/i }));

    // The connection promise is still pending, but Skip must remain clickable.
    expect(screen.getByRole("button", { name: /Skip/i })).not.toBeDisabled();

    await act(async () => {
      pending.resolve({ success: true });
      await pending.promise;
    });
  });

  it("does not resolve completed when the user skips mid-connection", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ success: boolean }>();
    createPersonalConnectionMock.mockReturnValue(pending.promise);

    renderCard();

    await user.click(screen.getByRole("button", { name: /Connect/i }));
    await user.click(screen.getByRole("button", { name: /Skip/i }));

    // Connection finishes *after* the user already skipped.
    await act(async () => {
      pending.resolve({ success: true });
      await pending.promise;
    });

    const outcomes = outcomesPassedToResolve();
    expect(outcomes).toContain("denied");
    expect(outcomes).not.toContain("completed");
  });
});
