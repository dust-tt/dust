import { buildManualActionRequiredMobilePush } from "@app/lib/notifications/workflows/manual-action-required";
import { describe, expect, it } from "vitest";

describe("buildManualActionRequiredMobilePush", () => {
  it("builds a high-signal data-only Android payload", () => {
    expect(
      buildManualActionRequiredMobilePush({
        workspaceId: "w1",
        conversationId: "c1",
        actionId: "a1",
      })
    ).toEqual({
      subject: "Action required",
      body: "A manual action requires your approval.",
      data: {
        dust_type: "manual_action_required",
        dust_workspace_id: "w1",
        dust_conversation_id: "c1",
        dust_action_id: "a1",
        dust_conversation_title: "Action required",
        dust_author_is_agent: "true",
        dust_is_mention: "false",
        dust_title: "Action required",
        dust_body: "A manual action requires your approval.",
      },
    });
  });
});
