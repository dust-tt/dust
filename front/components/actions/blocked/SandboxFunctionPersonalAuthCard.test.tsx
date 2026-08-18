import type { SandboxFunctionToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp_internal_actions/events";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SandboxFunctionPersonalAuthCard } from "./SandboxFunctionPersonalAuthCard";

// `@app/lib/auth/AuthContext` is deliberately NOT mocked: shared frames render this card outside
// any AuthProvider, so the component must not read the workspace/user from context.

const resolveAuthenticationMock = vi.fn();
const createPersonalConnectionMock = vi.fn();

vi.mock("@app/lib/swr/tool_actions", () => ({
  useResolveAuthentication: () => ({
    resolveAuthentication: resolveAuthenticationMock,
    isResolving: false,
  }),
}));

vi.mock("@app/lib/swr/mcp_servers", () => ({
  useCreatePersonalConnection: () => ({
    createPersonalConnection: createPersonalConnectionMock,
  }),
  useMCPServer: () => ({
    server: {
      sId: "ims_1",
      name: "Google Drive",
      icon: undefined,
      authorization: {
        provider: "google_drive",
        supported_use_cases: ["personal_actions"],
      },
    },
  }),
}));

vi.mock("@app/lib/actions/mcp_helper", () => ({
  getMcpServerDisplayName: (server: { name: string }) => server.name,
}));

vi.mock("@app/components/resources/resources_icons", () => ({
  getIcon: () => null,
}));

vi.mock("@app/components/oauth/PersonalAuthCredentialOverrides", () => ({
  areCredentialOverridesValid: () => true,
  PersonalAuthCredentialOverrides: () => null,
}));

vi.mock("@app/types/oauth/lib", () => ({
  getOverridablePersonalAuthInputs: () => null,
}));

vi.mock("@dust-tt/sparkle", () => ({
  Avatar: () => null,
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Button: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button onClick={onClick}>{label}</button>
  ),
  Check: () => null,
  Key01: () => null,
  XClose: () => null,
}));

const viewer = {
  owner: { sId: "wId_1" } as LightWorkspaceType,
  user: { sId: "user_1", fullName: "Ada Lovelace" } as UserType,
};

function makeEvent(
  invocationId: string,
  actionId: string
): SandboxFunctionToolPersonalAuthRequiredEvent {
  return {
    type: "tool_personal_auth_required",
    created: 0,
    sandboxFunctionId: "sfn_1",
    invocationId,
    actionId,
    userId: viewer.user.sId,
    metadata: {
      toolName: "get_worksheet",
      mcpServerName: "google_drive",
      agentName: "agent",
      mcpServerDisplayName: "google_drive",
      mcpServerId: "ims_1",
    },
    inputs: {},
    authError: {
      mcpServerId: "ims_1",
      provider: "google_drive",
      toolName: "get_worksheet",
      message: "The tool get_worksheet requires personal authentication.",
    },
  } satisfies SandboxFunctionToolPersonalAuthRequiredEvent;
}

describe("SandboxFunctionPersonalAuthCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPersonalConnectionMock.mockResolvedValue({ success: true });
    resolveAuthenticationMock.mockResolvedValue({ success: true });
  });

  it("renders outside of an AuthProvider, as on a shared frame", () => {
    render(
      <SandboxFunctionPersonalAuthCard
        events={[makeEvent("sfi_1", "sfa_1")]}
        viewer={viewer}
        onResolved={vi.fn()}
      />
    );

    expect(
      screen.getByText("Connect your Google Drive account to agent?")
    ).toBeDefined();
    // The viewer triggered the invocation, so they can resolve it themselves.
    expect(screen.getByText("Connect")).toBeDefined();
  });

  it("resolves every invocation waiting on the connection with a single card", async () => {
    const onResolved = vi.fn();
    render(
      <SandboxFunctionPersonalAuthCard
        events={[makeEvent("sfi_1", "sfa_1"), makeEvent("sfi_2", "sfa_2")]}
        viewer={viewer}
        onResolved={onResolved}
      />
    );

    await userEvent.click(screen.getByText("Connect"));

    expect(createPersonalConnectionMock).toHaveBeenCalledTimes(1);
    expect(resolveAuthenticationMock).toHaveBeenCalledTimes(2);
    expect(resolveAuthenticationMock).toHaveBeenCalledWith(
      expect.objectContaining({ invocationId: "sfi_1", actionId: "sfa_1" })
    );
    expect(resolveAuthenticationMock).toHaveBeenCalledWith(
      expect.objectContaining({ invocationId: "sfi_2", actionId: "sfa_2" })
    );
    expect(onResolved).toHaveBeenCalledTimes(1);
  });
});
