import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LightUserFactory } from "@app/tests/utils/LightUserFactory";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { ValidationRequiredToolExecutionFactory } from "@app/tests/utils/ValidationRequiredToolExecutionFactory";
import { MCPToolValidationRequired } from "./MCPToolValidationRequired";

const currentUser = LightUserFactory.build();
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
  useAuth: () => ({ user: currentUser }),
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

describe("MCPToolValidationRequired", () => {
  it("sends always_approved to every queued call of the same server and tool", async () => {
    const user = userEvent.setup();
    const teamCall = ValidationRequiredToolExecutionFactory.build({
      stake: "medium",
      argumentsRequiringApproval: ["to"],
      inputs: { to: "#team" },
    });
    const generalCall = ValidationRequiredToolExecutionFactory.build({
      stake: "medium",
      argumentsRequiringApproval: ["to"],
      inputs: { to: "#general" },
    });
    getBlockedActionsMock.mockReturnValue([
      teamCall,
      ValidationRequiredToolExecutionFactory.build({
        metadata: { ...teamCall.metadata, toolName: "other_tool" },
      }),
      ValidationRequiredToolExecutionFactory.build({
        metadata: { ...teamCall.metadata, mcpServerName: "other_server" },
      }),
      generalCall,
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
        [teamCall.actionId, "always_approved"],
        [generalCall.actionId, "always_approved"],
      ]);
    });
  });
});
