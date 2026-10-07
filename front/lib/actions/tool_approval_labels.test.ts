import { makePodConfigurationURI } from "@app/lib/actions/mcp_internal_actions/pod_configuration_uri";
import { getApprovalArgsLabel } from "@app/lib/actions/tool_approval_labels";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("getApprovalArgsLabel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
        internalMCPServerName: "pod_manager",
        toolName: "create_conversation",
        inputs: {
          dustPod: {
            uri: "pod://dust/w/ws123/pods/prj456",
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD,
          },
        },
        argumentsRequiringApproval: ["dustPod"],
      })
    ).resolves.toBe(
      'Always allow agents to Create conversation in "pod://dust/w/ws123/pods/prj456".'
    );

    expect(fetchByIdSpy).toHaveBeenCalledWith(auth, "prj456");
  });

  it("returns a label with the Pod name when the caller can read it", async () => {
    const { auth, workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    await expect(
      getApprovalArgsLabel({
        auth,
        internalMCPServerName: "pod_manager",
        toolName: "create_conversation",
        inputs: {
          dustPod: {
            uri: makePodConfigurationURI(workspace.sId, globalSpace.sId),
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD,
          },
        },
        argumentsRequiringApproval: ["dustPod"],
      })
    ).resolves.toBe(
      `Always allow agents to Create conversation in "${globalSpace.name}".`
    );
  });

  it("returns a label with the Pod URI when the caller cannot read it", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const otherPod = await SpaceFactory.project(workspace);
    const uri = makePodConfigurationURI(workspace.sId, otherPod.sId);

    await expect(
      getApprovalArgsLabel({
        auth,
        internalMCPServerName: "pod_manager",
        toolName: "add_message_to_conversation",
        inputs: {
          dustPod: {
            uri,
            mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD,
          },
        },
        argumentsRequiringApproval: ["dustPod"],
      })
    ).resolves.toBe(
      `Always allow agents to Add message to conversation in "${uri}".`
    );
  });
});
