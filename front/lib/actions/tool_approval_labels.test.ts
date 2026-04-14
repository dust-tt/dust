import { getApprovalArgsLabel } from "@app/lib/actions/tool_approval_labels";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { describe, expect, it, vi } from "vitest";

describe("getApprovalArgsLabel", () => {
  it("returns a label with project URI when space cannot be resolved", async () => {
    const fetchByIdSpy = vi
      .spyOn(SpaceResource, "fetchById")
      .mockResolvedValue(null);

    const auth = {
      getNonNullableWorkspace: () => ({ sId: "ws123" }),
    } as never;

    await expect(
      getApprovalArgsLabel({
        auth,
        internalMCPServerName: "project_manager",
        toolName: "create_conversation",
        agentName: "assistant",
        inputs: {
          dustProject: {
            uri: "project://dust/w/ws123/projects/prj456",
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT,
          },
        },
        argumentsRequiringApproval: ["dustProject"],
      })
    ).resolves.toBe(
      'Always allow @assistant to Create Conversation in "project://dust/w/ws123/projects/prj456".'
    );

    expect(fetchByIdSpy).toHaveBeenCalledWith(auth, "prj456");
  });

  it("returns a label with resolved space name", async () => {
    const fetchByIdSpy = vi
      .spyOn(SpaceResource, "fetchById")
      .mockResolvedValue({ name: "Revenue Ops" } as never);

    const auth = {
      getNonNullableWorkspace: () => ({ sId: "ws123" }),
    } as never;

    await expect(
      getApprovalArgsLabel({
        auth,
        internalMCPServerName: "project_manager",
        toolName: "create_conversation",
        agentName: "assistant",
        inputs: {
          dustProject: {
            uri: "project://dust/w/ws123/projects/prj456",
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT,
          },
        },
        argumentsRequiringApproval: ["dustProject"],
      })
    ).resolves.toBe(
      'Always allow @assistant to Create Conversation in "Revenue Ops".'
    );

    expect(fetchByIdSpy).toHaveBeenCalledWith(auth, "prj456");
  });
});
