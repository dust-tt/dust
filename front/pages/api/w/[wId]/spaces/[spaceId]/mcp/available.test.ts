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
import { honoApp } from "@dust-tt/front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/w/[wId]/spaces/[spaceId]/mcp/available", () => {
  it("returns available servers for regular user", async () => {
    // Sets up workspace, user, membership, and mocks getSession to return that
    // user's session. We don't use the returned req/res — the request goes
    // through the Hono app below.
    const { workspace, globalGroup } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const space = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(space, globalGroup);

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Mock the INTERNAL_MCP_SERVERS to override the "primitive_types_debugger" server config
    // so that the test passes even if we edit the server config.
    const originalPrimitiveTypesDebuggerConfig =
      INTERNAL_MCP_SERVERS["primitive_types_debugger"];
    Object.defineProperty(INTERNAL_MCP_SERVERS, "primitive_types_debugger", {
      value: {
        ...originalPrimitiveTypesDebuggerConfig,
        availability: "auto",
        isRestricted: ({
          featureFlags,
        }: {
          plan: PlanType;
          featureFlags: WhitelistableFeature[];
        }) => {
          return !featureFlags.includes("dev_mcp_actions");
        },
      },
      writable: true,
      configurable: true,
    });

    await FeatureFlagFactory.basic(auth, "dev_mcp_actions");

    // Internal server in the right workspace
    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      {
        name: "primitive_types_debugger",
        useCase: null,
      }
    );

    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    // Create some server views in global and current space
    await MCPServerViewFactory.create(workspace, remoteServer.sId, space);

    // Create another server in another workspace
    const workspace2 = await WorkspaceFactory.basic();
    await SpaceFactory.system(workspace2);
    await RemoteMCPServerFactory.create(workspace2);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${space.sId}/mcp/available`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.servers).toHaveLength(1); // Only one available server — the other is assigned to the system space
    expect(body.servers[0].sId).toBe(internalServer.id);
  });
});
