import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  buildTools,
  createToolsRecord,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { workspaceAdminGuard } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

// Two artificial tools to exercise the guard's behaviour through the real MCP
// stack, decoupled from any feature tool: one wraps workspaceAdminGuard, the
// other (control) does not.
const TEST_TOOLS_METADATA = createToolsRecord({
  guarded_tool: {
    description: "Admin-guarded test tool.",
    schema: {},
    stake: "never_ask",
    displayLabels: { running: "Running", done: "Ran" },
  },
  open_tool: {
    description: "Unguarded test tool.",
    schema: {},
    stake: "never_ask",
    displayLabels: { running: "Running", done: "Ran" },
  },
});

const handlers: ToolHandlers<typeof TEST_TOOLS_METADATA> = {
  guarded_tool: async (_params, { auth }) => {
    const denied = workspaceAdminGuard(auth);
    if (denied) {
      return new Err(denied);
    }
    return new Ok([{ type: "text" as const, text: "guarded ok" }]);
  },
  open_tool: async () => new Ok([{ type: "text" as const, text: "open ok" }]),
};

const TEST_TOOLS = buildTools(TEST_TOOLS_METADATA, handlers);

async function authForRole(role: MembershipRoleType): Promise<Authenticator> {
  const workspace = await WorkspaceFactory.basic();
  await GroupFactory.defaults(workspace);
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role });
  return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
}

// Stands up an in-memory MCP server with the test tools registered for `auth`,
// connects a client over the in-memory transport, and calls one tool.
async function callTestTool(auth: Authenticator, toolName: string) {
  const server = new McpServer({ name: "admin_guard_test", version: "1.0.0" });
  for (const tool of TEST_TOOLS) {
    registerTool(auth, undefined, server, tool, {
      monitoringName: "admin_guard_test",
    });
  }

  const [clientTransport, serverTransport] =
    InMemoryWithAuthTransport.createLinkedPair();
  const client = new Client({ name: "admin_guard_test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const result = await client.callTool({ name: toolName, arguments: {} });
  await client.close();
  return result;
}

describe("workspaceAdminGuard (via an in-memory MCP tool)", () => {
  it("lets an admin call a guarded tool", async () => {
    const auth = await authForRole("admin");
    const result = await callTestTool(auth, "guarded_tool");

    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain("guarded ok");
  });

  it("blocks a builder from a guarded tool", async () => {
    const auth = await authForRole("builder");
    const result = await callTestTool(auth, "guarded_tool");

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("admins");
  });

  it("lets a builder call an unguarded tool", async () => {
    const auth = await authForRole("builder");
    const result = await callTestTool(auth, "open_tool");

    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain("open ok");
  });
});
