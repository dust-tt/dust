import type { ValidationRequiredToolExecution } from "@app/components/assistant/conversation/editable_tool_validation/types";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { MCPToolValidationRequired } from "./MCPToolValidationRequired";

const validateActionMock = vi.fn().mockResolvedValue({ success: true });
const getBlockedActionsMock = vi.fn();

interface ToolValidationCardStubProps {
  onValidate: (approved: MCPValidationOutputType) => Promise<boolean>;
}

vi.mock("@app/components/actions/blocked/ToolValidationCard", () => ({
  ToolValidationCard: ({ onValidate }: ToolValidationCardStubProps) => (
    <button type="button" onClick={() => void onValidate("always_approved")}>
      Always allow
    </button>
  ),
}));

vi.mock(
  "@app/components/assistant/conversation/editable_tool_validation/EditableToolValidation",
  () => ({
    EditableToolValidation: () => null,
    isEditableToolValidationSupported: () => false,
  })
);

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ user: { sId: "user_1" } }),
  useFeatureFlags: () => ({ hasFeature: () => false }),
}));

vi.mock(
  "@app/components/assistant/conversation/BlockedActionsProvider",
  () => ({
    useBlockedActionsContext: () => ({
      getBlockedActions: getBlockedActionsMock,
      getApprovalProgress: () => undefined,
      removeCompletedAction: () => {},
      isActionPulsing: () => false,
      stopPulsingAction: () => {},
      isToolApprovedForConversation: () => false,
      approveToolForConversation: () => {},
    }),
  })
);

vi.mock("@app/lib/swr/tool_actions", () => ({
  useValidateAction: () => ({
    validateAction: validateActionMock,
    isValidating: false,
  }),
}));

vi.mock("@app/hooks/useNotification", () => ({
  useSendApiErrorNotification: () => () => {},
}));

const owner = LightWorkspaceFactory.build({ sId: "w_1", role: "user" });

function makeBlockedAction({
  actionId,
  mcpServerName,
  toolName,
  to,
}: {
  actionId: string;
  mcpServerName: string;
  toolName: string;
  to: string;
}): ValidationRequiredToolExecution {
  return {
    conversationId: "conv_1",
    messageId: "msg_1",
    configurationId: "config_1",
    actionId,
    userId: "user_1",
    created: 1,
    stake: "medium",
    metadata: { mcpServerName, toolName, agentName: "agent" },
    inputs: { to },
    argumentsRequiringApproval: ["to"],
    status: "blocked_validation_required",
    authorizationInfo: null,
  };
}

describe("MCPToolValidationRequired", () => {
  it("sends always_approved to every queued call of the same server and tool", async () => {
    const user = userEvent.setup();
    const teamCall = makeBlockedAction({
      actionId: "action_team",
      mcpServerName: "slack",
      toolName: "post_message",
      to: "#team",
    });
    getBlockedActionsMock.mockReturnValue([
      teamCall,
      makeBlockedAction({
        actionId: "action_schedule",
        mcpServerName: "slack",
        toolName: "schedule_message",
        to: "#general",
      }),
      makeBlockedAction({
        actionId: "action_teams",
        mcpServerName: "microsoft_teams",
        toolName: "post_message",
        to: "#general",
      }),
      makeBlockedAction({
        actionId: "action_general",
        mcpServerName: "slack",
        toolName: "post_message",
        to: "#general",
      }),
    ]);

    render(
      <MCPToolValidationRequired
        blockedAction={teamCall}
        triggeringUser={null}
        owner={owner}
      />
    );

    await user.click(screen.getByRole("button", { name: "Always allow" }));

    await waitFor(() => {
      expect(
        validateActionMock.mock.calls.map(([{ actionId, approved }]) => [
          actionId,
          approved,
        ])
      ).toEqual([
        ["action_team", "always_approved"],
        ["action_general", "always_approved"],
      ]);
    });
  });
});
