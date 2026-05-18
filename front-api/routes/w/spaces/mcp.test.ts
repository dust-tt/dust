import { describe, expect, it } from "vitest";

import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { PlanType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

import { honoApp } from "../../../app";

describe("GET /api/w/:wId/spaces/:spaceId/mcp/available", () => {
  it("returns available servers for regular user", async () => {
    // createPrivateApiMockRequest is reused for its side effects only:
    // workspace + user + membership setup, and the getSession mock.
    const { workspace, globalGroup } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const space = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(space, globalGroup);

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Override the primitive_types_debugger config so the test passes even if
    // we change the real one.
    const original = INTERNAL_MCP_SERVERS["primitive_types_debugger"];
    Object.defineProperty(INTERNAL_MCP_SERVERS, "primitive_types_debugger", {
      value: {
        ...original,
        availability: "auto",
        isRestricted: ({
          featureFlags,
        }: {
          plan: PlanType;
          featureFlags: WhitelistableFeature[];
        }) => !featureFlags.includes("dev_mcp_actions"),
      },
      writable: true,
      configurable: true,
    });

    await FeatureFlagFactory.basic(auth, "dev_mcp_actions");

    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      { name: "primitive_types_debugger", useCase: null }
    );

    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    await MCPServerViewFactory.create(workspace, remoteServer.sId, space);

    // Distractor: a server in a different workspace; must not appear.
    const workspace2 = await WorkspaceFactory.basic();
    await SpaceFactory.system(workspace2);
    await RemoteMCPServerFactory.create(workspace2);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${space.sId}/mcp/available`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.servers).toHaveLength(1); // The remote server is assigned to this space, so it's not "available".
    expect(body.servers[0].sId).toBe(internalServer.id);
  });
});
