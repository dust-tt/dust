import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  CREATE_AGENT_TOOL_NAME,
  DELETE_AGENT_TOOL_NAME,
} from "@app/lib/api/actions/servers/agent_authoring/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAgentsEditors } from "@app/lib/api/assistant/editors";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

import { TOOLS } from "./index";

function getTool(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  return tool;
}

// The tool never reads runContext, so a partial extra cast to ToolHandlerExtra is sufficient
// (mirroring skill_authoring).
function makeExtra(auth: Authenticator) {
  const extra: Pick<
    ToolHandlerExtra,
    "auth" | "requestId" | "sendNotification" | "sendRequest" | "signal"
  > = {
    auth,
    requestId: "test-request",
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request in agent_authoring test.");
    },
    signal: new AbortController().signal,
  };

  return extra as ToolHandlerExtra;
}

// A non-admin role membership does not grant create/agent by itself — it requires a group grant.
async function createAgentAuthorTestContext() {
  const result = await createResourceTest({ role: "user" });
  await grantWorkspacePermission(result.workspace, result.user, {
    grantType: "create",
    resourceType: "agent",
  });
  await result.authenticator.refresh();
  return result;
}

describe("agent_authoring tools", () => {
  describe(CREATE_AGENT_TOOL_NAME, () => {
    it("creates a hidden, instructions-only agent with the caller as sole editor", async () => {
      const { authenticator, user } = await createAgentAuthorTestContext();

      const result = await getTool(CREATE_AGENT_TOOL_NAME).handler(
        {
          name: "Incident Helper",
          description: "Helps triage incidents.",
          instructions: "Collect impact and timeline.",
        },
        makeExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }

      const output = result.value[0];
      expect(output?.type).toBe("text");
      if (output?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const parsed = JSON.parse(output.text) as {
        agent: { sId: string; name: string; description: string };
      };
      expect(parsed.agent.name).toBe("Incident Helper");
      expect(parsed.agent.description).toBe("Helps triage incidents.");

      const agent = await getAgentConfiguration(authenticator, {
        agentId: parsed.agent.sId,
        variant: "full",
      });
      expect(agent).not.toBeNull();
      expect(agent?.scope).toBe("hidden");
      expect(agent?.status).toBe("active");
      expect(agent?.instructions).toBe("Collect impact and timeline.");
      expect(agent?.actions).toHaveLength(0);

      const editors = await getAgentsEditors(authenticator, [agent!]);
      expect(editors[agent!.sId]?.map((e) => e.sId)).toEqual([user.sId]);
    });

    it("rejects an empty agent name", async () => {
      const { authenticator } = await createAgentAuthorTestContext();

      const result = await getTool(CREATE_AGENT_TOOL_NAME).handler(
        { name: "   ", description: "Desc", instructions: "Do things." },
        makeExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        throw new Error("Expected an error.");
      }
      expect(result.error.message).toContain("cannot be empty");
    });

    it("returns an MCPError without an interactive user", async () => {
      const { workspace } = await createAgentAuthorTestContext();
      const nonInteractiveAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const result = await getTool(CREATE_AGENT_TOOL_NAME).handler(
        { name: "No User", description: "Desc", instructions: "Do things." },
        makeExtra(nonInteractiveAuth)
      );

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        throw new Error("Expected an error.");
      }
      expect(result.error.message).toContain("interactive user");
    });

    it("returns an MCPError for users without the create-agent capability", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await getTool(CREATE_AGENT_TOOL_NAME).handler(
        {
          name: "Restricted",
          description: "Desc",
          instructions: "Do things.",
        },
        makeExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        throw new Error("Expected an error.");
      }
      expect(result.error.message).toContain("restricted");
    });
  });

  describe(DELETE_AGENT_TOOL_NAME, () => {
    it("archives an agent the caller is an editor of", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const result = await getTool(DELETE_AGENT_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }

      const reloaded = await getAgentConfiguration(authenticator, {
        agentId: agent.sId,
        variant: "light",
      });
      expect(reloaded?.status).toBe("archived");
    });

    it("allows a workspace admin to delete an agent they do not edit", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const result = await getTool(DELETE_AGENT_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(adminAuth)
      );

      expect(result.isOk()).toBe(true);
    });

    it("rejects a member who is not an editor of the agent", async () => {
      const { authenticator: ownerAuth, workspace } = await createResourceTest({
        role: "user",
      });
      const agent = await AgentConfigurationFactory.createTestAgent(ownerAuth);

      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, {
        role: "user",
      });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const result = await getTool(DELETE_AGENT_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(otherAuth)
      );

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        throw new Error("Expected an error.");
      }
      expect(result.error.message).toContain("editor");

      const reloaded = await getAgentConfiguration(ownerAuth, {
        agentId: agent.sId,
        variant: "light",
      });
      expect(reloaded?.status).toBe("active");
    });

    it("returns an MCPError for an unknown agent id", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await getTool(DELETE_AGENT_TOOL_NAME).handler(
        { agentId: "not-an-agent" },
        makeExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        throw new Error("Expected an error.");
      }
      expect(result.error.message).toContain("not found");
    });

    it("returns an MCPError for an already-archived agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const firstDelete = await getTool(DELETE_AGENT_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(authenticator)
      );
      expect(firstDelete.isOk()).toBe(true);

      const result = await getTool(DELETE_AGENT_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        throw new Error("Expected an error.");
      }
      expect(result.error.message).toContain("not found");
    });
  });
});
