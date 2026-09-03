import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import createWorkspaceManagementServer from "@app/lib/api/actions/servers/workspace_management";
import { TOOLS } from "@app/lib/api/actions/servers/workspace_management/tools";
import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

function getToolByName(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

function createTestExtra(auth: Authenticator, runContext?: unknown) {
  return {
    signal: new AbortController().signal,
    auth,
    runContext,
  } as Parameters<(typeof TOOLS)[0]["handler"]>[1];
}

// Lists the tools the server actually registers for this caller, which is what the model sees.
async function toolNamesFor(auth: Authenticator): Promise<string[]> {
  const client = new Client({
    name: "workspace-management-test",
    version: "1",
  });
  const [clientTransport, serverTransport] =
    InMemoryWithAuthTransport.createLinkedPair();

  const server = createWorkspaceManagementServer(auth);
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  await client.close();

  return tools.map((tool) => tool.name);
}

// Mirrors production: the MCP layer validates the input and applies the schema's defaults
// before the handler runs, so tests must go through the schema too.
function runTool(
  name: string,
  params: Record<string, unknown>,
  auth: Authenticator
) {
  const tool = getToolByName(name);

  return tool.handler(
    z.object(tool.schema).parse(params),
    createTestExtra(auth)
  );
}

async function callTool(
  name: string,
  params: Record<string, unknown>,
  auth: Authenticator
) {
  const result = await runTool(name, params, auth);
  if (result.isErr()) {
    throw new Error(`Tool ${name} failed: ${result.error.message}`);
  }
  const [content] = result.value;
  if (content.type !== "text") {
    throw new Error(`Tool ${name} did not return text`);
  }
  return content.text;
}

async function callToolLines(
  name: string,
  params: Record<string, unknown>,
  auth: Authenticator
) {
  return (await callTool(name, params, auth)).split("\n");
}

// An authenticator for a freshly created regular member of the workspace.
async function createOtherMemberAuth(workspace: LightWorkspaceType) {
  const agentOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, agentOwner, { role: "user" });
  return Authenticator.fromUserIdAndWorkspaceId(agentOwner.sId, workspace.sId);
}

// Creates, as another workspace member, one published agent, one unpublished agent the caller
// does not edit, and one published agent requesting a space the caller cannot read.
async function setupOtherMembersAgents(workspace: LightWorkspaceType) {
  const agentOwnerAuth = await createOtherMemberAuth(workspace);

  const restrictedSpace = await SpaceFactory.regular(
    agentOwnerAuth.getNonNullableWorkspace()
  );

  await AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
    name: "Published Agent",
    scope: "visible",
  });
  await AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
    name: "Unpublished Agent",
    scope: "hidden",
  });
  await AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
    name: "Restricted Space Agent",
    scope: "visible",
    requestedSpaceIds: [restrictedSpace.id],
  });
}

describe("workspace_management tools", () => {
  it.each([
    "list_agents",
    "get_agent_details",
    "list_skills",
    "get_skill_details",
  ])("%s is available to regular members", async (toolName) => {
    const { authenticator } = await createResourceTest({ role: "user" });
    expect(authenticator.isManager()).toBe(false);

    const result = await runTool(
      toolName,
      // The get_* tools need an id; an unknown one exercises the not-found path, which is
      // enough to show the tool is not refused outright.
      { agentId: "unknown", skillId: "unknown" },
      authenticator
    );

    expect(result.isOk()).toBe(true);
  });

  it("only lists the agents a regular member may read", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
    });
    await setupOtherMembersAgents(workspace);

    const text = await callTool("list_agents", {}, authenticator);

    expect(text).toContain("Published Agent");
    expect(text).not.toContain("Unpublished Agent");
    expect(text).not.toContain("Restricted Space Agent");
  });

  it("refuses all_unrestricted for regular members", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });

    const result = await runTool(
      "list_agents",
      { view: "all_unrestricted" },
      authenticator
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "This tool is restricted to workspace admins."
      );
    }
  });

  describe("list_agents", () => {
    it("hides unpublished and restricted space agents with the default view", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      await setupOtherMembersAgents(workspace);

      const text = await callTool("list_agents", {}, authenticator);

      expect(text).toContain("Published Agent");
      expect(text).not.toContain("Unpublished Agent");
      expect(text).not.toContain("Restricted Space Agent");
    });

    it("returns unpublished and restricted space agents with all_unrestricted", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      await setupOtherMembersAgents(workspace);

      const text = await callTool(
        "list_agents",
        { view: "all_unrestricted" },
        authenticator
      );

      expect(text).toContain("Published Agent");
      expect(text).toContain("Unpublished Agent");
      expect(text).toContain("Restricted Space Agent");
    });

    it("refuses all_unrestricted for managers who are not admins", async () => {
      const { authenticator } = await createResourceTest({ role: "manager" });
      expect(authenticator.isManager()).toBe(true);
      expect(authenticator.isAdmin()).toBe(false);

      const result = await runTool(
        "list_agents",
        { view: "all_unrestricted" },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "This tool is restricted to workspace admins."
        );
      }
    });

    it("lists archived agents only with the archived view", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      const kept = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Kept Agent" }
      );
      const removed = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Removed Agent" }
      );
      await archiveAgentConfiguration(authenticator, removed.sId);

      // The default view also carries Dust's global agents, so assert on membership.
      const active = await callTool("list_agents", {}, authenticator);
      expect(active).toContain(kept.name);
      expect(active).not.toContain("Removed Agent");

      const archived = await callToolLines(
        "list_agents",
        { view: "archived" },
        authenticator
      );
      expect(archived).toEqual([
        expect.stringContaining(`Removed Agent [${removed.sId}]`),
        "Showing 1 of 1.",
      ]);
      expect(archived[0]).toContain("status: archived");
    });

    it("returns the agent's scope, model and tags, and paginates", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      await AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "Aardvark Agent",
      });
      await AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "Zebra Agent",
      });

      const firstPage = await callToolLines(
        "list_agents",
        { namePrefix: "Aardvark", limit: 1 },
        authenticator
      );

      expect(firstPage).toHaveLength(2);
      expect(firstPage[0]).toContain("Aardvark Agent");
      expect(firstPage[0]).toContain(
        "scope: visible, status: active, model: gpt-5-mini"
      );
      expect(firstPage[0]).toContain("canEdit: true");
      expect(firstPage[1]).toBe("Showing 1 of 1.");

      // Both agents match, so the first page must hand back a cursor for the second.
      const paged = await callToolLines(
        "list_agents",
        { namePrefix: "", limit: 1 },
        authenticator
      );
      expect(paged.at(-1)).toContain("Pass cursor: 1 for the next page.");
    });
  });

  describe("get_agent_details", () => {
    it("returns the agent's instructions", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Documented Agent" }
      );

      const text = await callTool(
        "get_agent_details",
        { agentId: agent.sId },
        authenticator
      );

      expect(text).toContain("Documented Agent");
      expect(text).toContain("Test Instructions");
    });

    it("reports an unknown agent without failing", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const text = await callTool(
        "get_agent_details",
        { agentId: "does-not-exist" },
        authenticator
      );

      expect(text).toContain("No agent found");
    });

    it("redacts the private fields of an unpublished agent for a non-editor admin", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const agentOwnerAuth = await createOtherMemberAuth(workspace);
      const agent = await AgentConfigurationFactory.createTestAgent(
        agentOwnerAuth,
        { name: "Unpublished Agent", scope: "hidden" }
      );

      const text = await callTool(
        "get_agent_details",
        { agentId: agent.sId },
        authenticator
      );

      expect(text).toContain("Unpublished Agent");
      expect(text).toContain(`Description: ${agent.description}`);
      expect(text).toContain("private");
      expect(text).not.toContain("Test Instructions");
    });

    it("redacts the private fields of an agent built on a space the admin cannot read", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const agentOwnerAuth = await createOtherMemberAuth(workspace);
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const agent = await AgentConfigurationFactory.createTestAgent(
        agentOwnerAuth,
        {
          name: "Restricted Space Agent",
          scope: "visible",
          requestedSpaceIds: [restrictedSpace.id],
        }
      );

      const text = await callTool(
        "get_agent_details",
        { agentId: agent.sId },
        authenticator
      );

      expect(text).toContain("Restricted Space Agent");
      expect(text).toContain("private");
      expect(text).not.toContain("Test Instructions");
    });

    it("does not reveal an unpublished agent to a non-editor member", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "user",
      });
      const agentOwnerAuth = await createOtherMemberAuth(workspace);
      const agent = await AgentConfigurationFactory.createTestAgent(
        agentOwnerAuth,
        { name: "Unpublished Agent", scope: "hidden" }
      );

      const text = await callTool(
        "get_agent_details",
        { agentId: agent.sId },
        authenticator
      );

      expect(text).toContain("No agent found");
      expect(text).not.toContain("Unpublished Agent");
    });
  });

  describe("list_skills", () => {
    it("returns custom skills with their availability", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      await SkillFactory.create(authenticator, {
        name: "Editors Only Skill",
        availability: "editors",
      });
      await SkillFactory.create(authenticator, {
        name: "Discoverable Skill",
        availability: "users_and_agents",
      });

      const lines = await callToolLines("list_skills", {}, authenticator);

      expect(lines).toEqual([
        expect.stringContaining("Discoverable Skill"),
        expect.stringContaining("Editors Only Skill"),
        "Showing 2 of 2.",
      ]);
      expect(lines[0]).toContain(
        "kind: custom, availability: users_and_agents, status: active, canWrite: true"
      );
      expect(lines[1]).toContain("availability: editors");
      // Usage is opt-in.
      expect(lines[0]).not.toContain("agentsUsing");
    });

    it("filters by availability", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      await SkillFactory.create(authenticator, {
        name: "Editors Only Skill",
        availability: "editors",
      });
      await SkillFactory.create(authenticator, {
        name: "Discoverable Skill",
        availability: "users_and_agents",
      });

      const lines = await callToolLines(
        "list_skills",
        { availability: ["users_and_agents"] },
        authenticator
      );

      expect(lines).toEqual([
        expect.stringContaining("Discoverable Skill"),
        "Showing 1 of 1.",
      ]);
    });

    it("returns the agent count when includeUsage is set", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      await SkillFactory.create(authenticator, { name: "Unused Skill" });

      const lines = await callToolLines(
        "list_skills",
        { includeUsage: true },
        authenticator
      );

      expect(lines[0]).toContain("Unused Skill");
      expect(lines[0]).toContain("agentsUsing: 0");
    });

    it("excludes archived skills unless asked for them", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      await SkillFactory.create(authenticator, {
        name: "Archived Skill",
        status: "archived",
      });

      const active = await callTool("list_skills", {}, authenticator);
      expect(active).toBe("No custom skills found.");

      const archived = await callToolLines(
        "list_skills",
        { status: "archived" },
        authenticator
      );
      expect(archived[0]).toContain("Archived Skill");
      expect(archived[0]).toContain("status: archived");
    });
  });

  describe("list_workspace_members", () => {
    it("rejects lookups from a non-manager", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "user",
      });
      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      const result = await runTool(
        "list_workspace_members",
        { userIds: [targetUser.sId] },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("admins and managers");
      }
    });

    it("allows managers to list members", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "manager",
      });
      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      const lines = await callToolLines(
        "list_workspace_members",
        { userIds: [targetUser.sId] },
        authenticator
      );

      expect(lines).toEqual([expect.stringContaining(targetUser.sId)]);
      expect(lines[0]).toContain(") - user");
    });

    it("rejects calls with more than one filter", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const result = await runTool(
        "list_workspace_members",
        { userIds: ["u"], jobType: "engineering" },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("at most one");
      }
    });

    it("lists the whole workspace when no filter is given", async () => {
      const { workspace, authenticator, user } = await createResourceTest({
        role: "admin",
      });
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });

      const lines = await callToolLines(
        "list_workspace_members",
        {},
        authenticator
      );

      const text = lines.join("\n");
      expect(text).toContain(user.sId);
      expect(text).toContain(otherUser.sId);
      // Everything fits under the cap, so no truncation notice.
      expect(text).not.toContain("Narrow with");
    });

    it("returns role, job function, and groups for a member batch", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const salesUser = await UserFactory.basic();
      const engineeringUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, salesUser, {
        role: "admin",
      });
      await MembershipFactory.associate(workspace, engineeringUser, {
        role: "user",
      });
      await salesUser.setMetadata("job_type", "sales");
      await engineeringUser.setMetadata("job_type", "engineering");
      const group = await GroupFactory.regularManual(
        workspace,
        "Enterprise Sales"
      );
      await GroupFactory.withMembers(authenticator, group, [salesUser]);

      const lines = await callToolLines(
        "list_workspace_members",
        { userIds: [salesUser.sId, engineeringUser.sId], includeGroups: true },
        authenticator
      );

      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain(salesUser.sId);
      expect(lines[0]).toContain(") - admin");
      expect(lines[0]).toContain("groups: Enterprise Sales");
      expect(lines[1]).toContain(engineeringUser.sId);
      expect(lines[1]).toContain(") - user");

      // Groups are opt-in.
      const withoutGroups = await callTool(
        "list_workspace_members",
        { userIds: [salesUser.sId] },
        authenticator
      );
      expect(withoutGroups).not.toContain("groups:");
    });

    it("returns only members matching a jobType filter", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const salesUser = await UserFactory.basic();
      const engineeringUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, salesUser, { role: "user" });
      await MembershipFactory.associate(workspace, engineeringUser, {
        role: "user",
      });
      await salesUser.setMetadata("job_type", "sales");
      await engineeringUser.setMetadata("job_type", "engineering");

      const text = await callTool(
        "list_workspace_members",
        { jobType: "sales" },
        authenticator
      );

      expect(text).toContain(salesUser.sId);
      expect(text).not.toContain(engineeringUser.sId);
    });

    it("returns only members belonging to a groupId filter", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const groupUser = await UserFactory.basic();
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, groupUser, { role: "user" });
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const group = await GroupFactory.regularManual(workspace, "Sales Team");
      await GroupFactory.withMembers(authenticator, group, [groupUser]);

      const text = await callTool(
        "list_workspace_members",
        { groupId: group.sId },
        authenticator
      );

      expect(text).toContain(groupUser.sId);
      expect(text).not.toContain(otherUser.sId);
    });

    it("paginates with cursor and limit", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });

      const firstPage = await callToolLines(
        "list_workspace_members",
        { limit: 1 },
        authenticator
      );

      // One member row, then the footer pointing at the next page.
      expect(firstPage).toHaveLength(2);
      expect(firstPage[1]).toBe(
        "Showing 1 of 2. Pass cursor: 1 for the next page."
      );

      const secondPage = await callToolLines(
        "list_workspace_members",
        { limit: 1, cursor: 1 },
        authenticator
      );

      expect(secondPage).toHaveLength(2);
      expect(secondPage[1]).toBe("Showing 1 of 2.");
      expect(secondPage[0]).not.toBe(firstPage[0]);
    });

    it("rejects a cursor past the end", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const result = await runTool(
        "list_workspace_members",
        { cursor: 500 },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("out of range");
      }
    });

    it("is not registered for non-managers", async () => {
      const { authenticator: memberAuth } = await createResourceTest({
        role: "user",
      });
      const { authenticator: managerAuth } = await createResourceTest({
        role: "manager",
      });

      expect(await toolNamesFor(memberAuth)).not.toContain(
        "list_workspace_members"
      );
      expect(await toolNamesFor(managerAuth)).toContain(
        "list_workspace_members"
      );
    });
  });

  describe("get_skill_details", () => {
    it("returns a custom skill's instructions", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      const created = await SkillFactory.create(authenticator, {
        name: "Documented Skill",
        instructions: "Do the thing, then the other thing.",
      });

      const text = await callTool(
        "get_skill_details",
        { skillId: created.sId },
        authenticator
      );

      expect(text).toContain(`Skill Documented Skill [${created.sId}]`);
      expect(text).toContain("kind: custom");
      expect(text).toContain("- Tools: none");
      expect(text).toContain("Do the thing, then the other thing.");
    });

    it("reports an unknown skill without failing", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const text = await callTool(
        "get_skill_details",
        { skillId: "does-not-exist" },
        authenticator
      );

      expect(text).toContain("No skill found");
    });
  });
});
