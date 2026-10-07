import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import createWorkspaceManagementServer from "@app/lib/api/actions/servers/workspace_management";
import { TOOLS } from "@app/lib/api/actions/servers/workspace_management/tools";
import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockSearch, mockWithEs } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockWithEs: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, withEs: mockWithEs };
});

// The similarity checker calls an LLM: keep the tests hermetic.
vi.mock("@app/lib/api/skills/existing_skill_checker", () => ({
  getSimilarSkills: vi.fn(),
}));

import { getSimilarSkills } from "@app/lib/api/skills/existing_skill_checker";

const mockGetSimilarSkills = vi.mocked(getSimilarSkills);

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

describe("workspace_management tools", () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockSearch.mockResolvedValue({
      hits: { hits: [], total: { value: 0, relation: "eq" } },
    });
    mockWithEs.mockReset();
    mockWithEs.mockImplementation(
      async (fn) => new Ok(await fn({ search: mockSearch }))
    );
  });
  it.each([
    "search_agents",
    "get_agent_details",
    "search_skills",
    "get_skill_details",
    "list_tags",
  ])("%s is available to regular members", async (toolName) => {
    const { authenticator } = await createResourceTest({ role: "user" });
    expect(authenticator.isManager()).toBe(false);

    const result = await runTool(
      toolName,
      // The get_* tools need an id; an unknown one exercises the not-found path, which is
      // enough to show the tool is not refused outright.
      { agentId: "unknown", skillId: "unknown", query: "unknown" },
      authenticator
    );

    expect(result.isOk()).toBe(true);
  });

  describe("search tools", () => {
    it("registers search tools instead of the agent and skill listing tools", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const names = await toolNamesFor(authenticator);

      expect(names).toContain("search_agents");
      expect(names).toContain("search_skills");
      expect(names).not.toContain("list_agents");
      expect(names).not.toContain("list_skills");
    });

    it("returns the listed agents with an empty query", async () => {
      const { authenticator, user } = await createResourceTest({
        role: "user",
      });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Meeting Recap" }
      );
      const resource = await AgentResource.fetchById(authenticator, agent.sId);
      expect(resource).not.toBeNull();
      const document = resource!.toSearchDocument(authenticator, {
        activeUsersCount: 0,
        editors: [user],
        favoriteCount: 0,
        feedbackNegativeCount: 0,
        feedbackPositiveCount: 0,
        lastEditedByUser: user,
        mcpServerViewIds: [],
        skillIds: [],
        tagIds: [],
      });
      mockSearch.mockResolvedValue({
        hits: {
          hits: [{ _source: document }],
          total: { value: 1, relation: "eq" },
        },
      });

      const lines = await callToolLines(
        "search_agents",
        { query: "" },
        authenticator
      );

      expect(lines[0]).toContain(`Meeting Recap [${agent.sId}]`);
      expect(lines[1]).toBe("Showing 1 of 1.");
      expect(mockSearch.mock.lastCall?.[0].query.bool.must).toEqual([
        { match_all: {} },
      ]);
    });

    it("returns the listed skills with an empty query", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await SkillFactory.create(authenticator, {
        name: "Meeting Recap",
      });
      const [document] = await SkillFactory.createSearchDocuments(
        authenticator,
        [skill]
      );
      mockSearch.mockResolvedValue({
        hits: {
          hits: [{ _source: document }],
          total: { value: 1, relation: "eq" },
        },
      });

      const lines = await callToolLines(
        "search_skills",
        { query: "" },
        authenticator
      );

      expect(lines[0]).toContain(`Meeting Recap [${skill.sId}]`);
      expect(lines[1]).toBe("Showing 1 of 1.");
      expect(mockSearch.mock.lastCall?.[0].query.bool.must).toEqual([
        { match_all: {} },
      ]);
    });

    it("supports skill search without an interactive user", async () => {
      const { workspace } = await createResourceTest({ role: "user" });
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      expect(auth.user()).toBeNull();
      mockSearch.mockResolvedValue({
        hits: { hits: [], total: { value: 0, relation: "eq" } },
      });

      expect(await callTool("search_skills", { query: "sales" }, auth)).toBe(
        "Showing 0 of 0."
      );
    });

    it("returns agents in ES relevance order and paginates in ES", async () => {
      const { authenticator, user } = await createResourceTest({
        role: "user",
      });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Zulu Sales" }
      );
      const resource = await AgentResource.fetchById(authenticator, agent.sId);
      expect(resource).not.toBeNull();
      const document = resource!.toSearchDocument(authenticator, {
        activeUsersCount: 0,
        editors: [user],
        favoriteCount: 0,
        feedbackNegativeCount: 0,
        feedbackPositiveCount: 0,
        lastEditedByUser: user,
        mcpServerViewIds: [],
        skillIds: [],
        tagIds: [],
      });
      mockSearch.mockResolvedValue({
        hits: {
          hits: [
            { _source: document },
            {
              _source: { ...document, name: "Alpha Sales", agent_id: "alpha" },
            },
          ],
          total: { value: 5, relation: "eq" },
        },
      });

      const lines = await callToolLines(
        "search_agents",
        { query: "sales", cursor: 1, limit: 2 },
        authenticator
      );

      expect(lines[0]).toContain(`Zulu Sales [${agent.sId}]`);
      expect(lines[1]).toContain("Alpha Sales [alpha]");
      expect(lines[2]).toBe(
        "Showing 2 of 5. Pass cursor: 3 for the next page."
      );
      expect(mockSearch.mock.lastCall?.[0]).toMatchObject({ from: 1, size: 2 });
      expect(lines.join("\n")).not.toContain("Test Instructions");
    });

    it("returns skill summaries from the index with the selected filters", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await SkillFactory.create(authenticator, {
        name: "Marketing Sales",
        availability: "users_and_agents",
      });
      const [document] = await SkillFactory.createSearchDocuments(
        authenticator,
        [skill]
      );
      mockSearch.mockResolvedValue({
        hits: {
          hits: [{ _source: document }],
          total: { value: 1, relation: "eq" },
        },
      });

      const lines = await callToolLines(
        "search_skills",
        { query: "sal mar", availability: ["users_and_agents"] },
        authenticator
      );

      expect(lines[0]).toContain(`Marketing Sales [${skill.sId}]`);
      expect(lines[0]).toContain("availability: users_and_agents");
      expect(lines[1]).toBe("Showing 1 of 1.");
      expect(mockSearch.mock.lastCall?.[0].query.bool.filter).toContainEqual({
        terms: { availability: ["users_and_agents"] },
      });
      expect(mockSearch.mock.lastCall?.[0]).toMatchObject({
        from: 0,
        size: 20,
      });
      expect(lines.join("\n")).not.toContain(skill.instructions);
    });

    it.each(["search_agents", "search_skills"])(
      "%s distinguishes empty results, bad cursors and ES failures",
      async (toolName) => {
        const { authenticator } = await createResourceTest({ role: "user" });
        mockSearch.mockResolvedValue({
          hits: { hits: [], total: { value: 0, relation: "eq" } },
        });
        expect(
          await callTool(toolName, { query: "unknown" }, authenticator)
        ).toBe("Showing 0 of 0.");

        const invalidCursor = await runTool(
          toolName,
          { query: "unknown", cursor: 1 },
          authenticator
        );
        expect(invalidCursor.isErr()).toBe(true);
        if (invalidCursor.isErr()) {
          expect(invalidCursor.error.message).toContain(
            "cursor 1 is out of range"
          );
          expect(invalidCursor.error.tracked).toBe(false);
        }

        mockSearch.mockClear();
        const invalidWindow = await runTool(
          toolName,
          { query: "unknown", cursor: 10_000 },
          authenticator
        );
        expect(invalidWindow.isErr()).toBe(true);
        expect(mockSearch).not.toHaveBeenCalled();

        const error = new ElasticsearchError(
          "connection_error",
          "ES unavailable"
        );
        mockWithEs.mockResolvedValueOnce(new Err(error));
        const failure = await runTool(
          toolName,
          { query: "unknown" },
          authenticator
        );
        expect(failure.isErr()).toBe(true);
        if (failure.isErr()) {
          expect(failure.error.cause).toBe(error);
        }
      }
    );
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

    it("returns the instructions of an unpublished agent to an admin with the admin_can_see_private_entities flag", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      await FeatureFlagFactory.basic(
        authenticator,
        "admin_can_see_private_entities"
      );
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
      expect(text).toContain("Test Instructions");
      expect(text).not.toContain("private");
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

  describe("list_tags", () => {
    it("lists the workspace's tags by name with their id, flagging protected ones", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "user",
      });
      const sales = await TagFactory.create(workspace, { name: "Sales" });
      const official = await TagFactory.create(workspace, {
        name: "Official",
        kind: "protected",
      });

      const lines = await callToolLines("list_tags", {}, authenticator);

      expect(lines).toEqual([
        `Official [${official.sId}] - protected`,
        `Sales [${sales.sId}]`,
      ]);
    });

    it("reports a workspace without tags", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      expect(await callTool("list_tags", {}, authenticator)).toBe(
        "No tags found."
      );
    });
  });

  describe("list_groups", () => {
    it("lists provisioned and manual groups with their kind and member count", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "manager",
      });
      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });
      const manual = await GroupFactory.regularManual(workspace, "Sales Team");
      const provisioned = await GroupFactory.provisioned(
        workspace,
        "Engineering (IdP)"
      );
      // Internal kinds never show up.
      await GroupFactory.regularAuto(workspace, "Space Members");
      await GroupFactory.withMembers(authenticator, manual, [member]);

      const lines = await callToolLines("list_groups", {}, authenticator);

      expect(lines).toEqual([
        `Engineering (IdP) [${provisioned.sId}] - provisioned, members: 0`,
        `Sales Team [${manual.sId}] - regular_manual, members: 1`,
      ]);
    });

    it("shows the role a group grants", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const group = await GroupFactory.regularManual(workspace, "Admins", {
        grantedRole: "admin",
      });

      const lines = await callToolLines("list_groups", {}, authenticator);

      expect(lines).toEqual([
        `Admins [${group.sId}] - regular_manual, members: 0, grants: admin`,
      ]);
    });

    it("filters by kind", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const manual = await GroupFactory.regularManual(workspace, "Sales Team");
      const provisioned = await GroupFactory.provisioned(workspace, "IdP");

      const text = await callTool(
        "list_groups",
        { kind: "provisioned" },
        authenticator
      );

      expect(text).toContain(provisioned.sId);
      expect(text).not.toContain(manual.sId);
    });

    it("reports an empty workspace", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      expect(await callTool("list_groups", {}, authenticator)).toBe(
        "No groups found."
      );
    });
  });

  describe("get_group_members", () => {
    it("lists the group's members with their id and name", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "manager",
      });
      const groupUser = await UserFactory.basic();
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, groupUser, { role: "user" });
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const group = await GroupFactory.provisioned(workspace, "IdP");
      await GroupFactory.withMembers(authenticator, group, [groupUser]);

      const lines = await callToolLines(
        "get_group_members",
        { groupId: group.sId },
        authenticator
      );

      expect(lines).toEqual([`${groupUser.fullName()} [${groupUser.sId}]`]);
    });

    it("paginates with cursor and limit", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const users = [await UserFactory.basic(), await UserFactory.basic()];
      for (const user of users) {
        await MembershipFactory.associate(workspace, user, { role: "user" });
      }
      const group = await GroupFactory.regularManual(workspace, "Sales Team");
      await GroupFactory.withMembers(authenticator, group, users);

      const firstPage = await callToolLines(
        "get_group_members",
        { groupId: group.sId, limit: 1 },
        authenticator
      );
      expect(firstPage).toHaveLength(2);
      expect(firstPage[1]).toBe(
        "Showing 1 of 2. Pass cursor: 1 for the next page."
      );

      const secondPage = await callToolLines(
        "get_group_members",
        { groupId: group.sId, limit: 1, cursor: 1 },
        authenticator
      );
      expect(secondPage).toEqual([expect.any(String), "Showing 1 of 2."]);
      expect(secondPage[0]).not.toBe(firstPage[0]);
    });

    it("reports an empty group", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const group = await GroupFactory.regularManual(workspace, "Empty");

      expect(
        await callTool(
          "get_group_members",
          { groupId: group.sId },
          authenticator
        )
      ).toBe(`Group Empty [${group.sId}] has no members.`);
    });

    it("hides internal groups and unknown ids alike", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const internal = await GroupFactory.regularAuto(workspace, "Internal");

      for (const groupId of [internal.sId, "unknown"]) {
        const result = await runTool(
          "get_group_members",
          { groupId },
          authenticator
        );
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain("Group not found");
        }
      }
    });
  });

  describe("update_group_members", () => {
    it("adds and removes members of a manual group", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "manager",
      });
      const staying = await UserFactory.basic();
      const leaving = await UserFactory.basic();
      const joining = await UserFactory.basic();
      for (const user of [staying, leaving, joining]) {
        await MembershipFactory.associate(workspace, user, { role: "user" });
      }
      const group = await GroupFactory.regularManual(workspace, "Sales Team");
      await GroupFactory.withMembers(authenticator, group, [staying, leaving]);

      const lines = await callToolLines(
        "update_group_members",
        {
          groupId: group.sId,
          additions: [joining.sId],
          removals: [leaving.sId],
        },
        authenticator
      );

      expect(lines).toEqual([
        `Updated group Sales Team [${group.sId}].`,
        `Added: ${joining.fullName()} [${joining.sId}]`,
        `Removed: ${leaving.fullName()} [${leaving.sId}]`,
      ]);

      const members = await callTool(
        "get_group_members",
        { groupId: group.sId },
        authenticator
      );
      expect(members).toContain(staying.sId);
      expect(members).toContain(joining.sId);
      expect(members).not.toContain(leaving.sId);
    });

    it("refuses provisioned groups", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });
      const group = await GroupFactory.provisioned(workspace, "IdP");

      const result = await runTool(
        "update_group_members",
        { groupId: group.sId, additions: [user.sId] },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("provisioned");
      }
    });

    it("refuses an empty change", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const group = await GroupFactory.regularManual(workspace, "Sales Team");

      const result = await runTool(
        "update_group_members",
        { groupId: group.sId },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("at least one user id");
      }
    });

    it("refuses to remove the last member", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const only = await UserFactory.basic();
      await MembershipFactory.associate(workspace, only, { role: "user" });
      const group = await GroupFactory.regularManual(workspace, "Sales Team");
      await GroupFactory.withMembers(authenticator, group, [only]);

      const result = await runTool(
        "update_group_members",
        { groupId: group.sId, removals: [only.sId] },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      const members = await callTool(
        "get_group_members",
        { groupId: group.sId },
        authenticator
      );
      expect(members).toContain(only.sId);
    });

    it("refuses managers on a group that grants the admin role", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "manager",
      });
      const admin = await UserFactory.basic();
      const candidate = await UserFactory.basic();
      await MembershipFactory.associate(workspace, admin, { role: "admin" });
      await MembershipFactory.associate(workspace, candidate, { role: "user" });
      const group = await GroupFactory.regularManual(workspace, "Admins", {
        grantedRole: "admin",
      });
      await GroupFactory.withMembers(authenticator, group, [admin]);

      const result = await runTool(
        "update_group_members",
        { groupId: group.sId, additions: [candidate.sId] },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("gives admin-level permissions");
      }
      const members = await callTool(
        "get_group_members",
        { groupId: group.sId },
        authenticator
      );
      expect(members).not.toContain(candidate.sId);
    });

    it("lets admins edit a group that grants the admin role", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const candidate = await UserFactory.basic();
      await MembershipFactory.associate(workspace, candidate, { role: "user" });
      const group = await GroupFactory.regularManual(workspace, "Admins", {
        grantedRole: "admin",
      });

      const lines = await callToolLines(
        "update_group_members",
        { groupId: group.sId, additions: [candidate.sId] },
        authenticator
      );

      expect(lines[1]).toContain(candidate.sId);
    });

    it("reports unknown users without changing the group", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const group = await GroupFactory.regularManual(workspace, "Sales Team");

      const result = await runTool(
        "update_group_members",
        { groupId: group.sId, additions: ["unknown"] },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("not found");
      }
    });
  });

  describe("create_group", () => {
    it("creates a manual group with its members", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "manager",
      });
      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });

      vi.mocked(workosAudit.emitAuditLogEvent).mockClear();
      const lines = await callToolLines(
        "create_group",
        { name: "Sales Team", memberIds: [member.sId] },
        authenticator
      );

      expect(lines).toHaveLength(2);
      expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "group.created",
          metadata: {
            group_name: "Sales Team",
            member_count: "1",
            manager_count: "0",
          },
        })
      );
      expect(lines[0]).toMatch(/^Created group Sales Team \[.+\]\.$/);
      expect(lines[1]).toBe(`Members: ${member.fullName()} [${member.sId}]`);

      const groups = await callTool("list_groups", {}, authenticator);
      expect(groups).toContain("Sales Team");
      expect(groups).toContain("regular_manual, members: 1");
    });

    it("refuses a duplicate name", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });
      await GroupFactory.regularManual(workspace, "Sales Team");

      const result = await runTool(
        "create_group",
        { name: "Sales Team", memberIds: [member.sId] },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("already exists");
      }
    });

    it("refuses unknown users", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const result = await runTool(
        "create_group",
        { name: "Sales Team", memberIds: ["unknown"] },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("not found");
      }
    });

    it("rejects an empty member list at the schema level", () => {
      const tool = getToolByName("create_group");

      expect(() =>
        z.object(tool.schema).parse({ name: "Sales Team", memberIds: [] })
      ).toThrow();
    });
  });

  it.each([
    "list_groups",
    "get_group_members",
    "update_group_members",
    "create_group",
  ])("%s is manager-only", async (toolName) => {
    const { authenticator: memberAuth } = await createResourceTest({
      role: "user",
    });
    const { authenticator: managerAuth } = await createResourceTest({
      role: "manager",
    });

    const result = await runTool(
      toolName,
      { groupId: "unknown", name: "Sales Team", memberIds: ["unknown"] },
      memberAuth
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("admins and managers");
    }

    expect(await toolNamesFor(memberAuth)).not.toContain(toolName);
    expect(await toolNamesFor(managerAuth)).toContain(toolName);
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

  // Auto internal tools are listed too, so the assertions isolate the fixtures with a prefix.
  describe("list_similar_skills", () => {
    beforeEach(() => {
      mockGetSimilarSkills.mockReset();
    });

    it("returns the ids of the similar skills", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      mockGetSimilarSkills.mockResolvedValue(
        new Ok({ similar_skills: ["skill1", "skill2"], skills: [] })
      );

      const lines = await callToolLines(
        "list_similar_skills",
        { description: "Use when the user wants to open a GitHub issue." },
        authenticator
      );

      expect(lines).toEqual(["skill1", "skill2"]);
      expect(mockGetSimilarSkills).toHaveBeenCalledWith(authenticator, {
        naturalDescription: "Use when the user wants to open a GitHub issue.",
        excludeSkillId: null,
      });
    });

    it("says so when no skill is similar", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      mockGetSimilarSkills.mockResolvedValue(
        new Ok({ similar_skills: [], skills: [] })
      );

      const text = await callTool(
        "list_similar_skills",
        { description: "Build slide decks." },
        authenticator
      );

      expect(text).toBe("No similar skills found.");
    });

    it("returns an error when the similarity check fails", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      mockGetSimilarSkills.mockResolvedValue(new Err(new Error("LLM down")));

      const result = await runTool(
        "list_similar_skills",
        { description: "Build slide decks." },
        authenticator
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "Failed to list similar skills: LLM down"
        );
      }
    });

    it("rejects an empty description", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      expect(() =>
        runTool("list_similar_skills", { description: "" }, authenticator)
      ).toThrow();
      expect(mockGetSimilarSkills).not.toHaveBeenCalled();
    });
  });

  describe("list_tools", () => {
    it("lists the tools of readable spaces only, sorted by name", async () => {
      const { workspace, globalSpace, authenticator } =
        await createResourceTest({ role: "user" });
      const restrictedSpace = await SpaceFactory.regular(workspace);

      const visibleA = await RemoteMCPServerFactory.create(workspace, {
        name: "Zzzendesk",
        description: "Manage tickets",
      });
      const visibleB = await RemoteMCPServerFactory.create(workspace, {
        name: "Zzairtable",
        description: "Manage bases",
      });
      const hidden = await RemoteMCPServerFactory.create(workspace, {
        name: "Zzhidden",
      });

      const viewA = await MCPServerViewFactory.create(
        workspace,
        visibleA.sId,
        globalSpace
      );
      const viewB = await MCPServerViewFactory.create(
        workspace,
        visibleB.sId,
        globalSpace
      );
      await MCPServerViewFactory.create(workspace, hidden.sId, restrictedSpace);

      const lines = await callToolLines(
        "list_tools",
        { namePrefix: "zz" },
        authenticator
      );

      expect(lines).toEqual([
        `Zzairtable [${viewB.sId}] — type: remote, availability: manual — Manage bases`,
        `Zzzendesk [${viewA.sId}] — type: remote, availability: manual — Manage tickets`,
        "Showing 2 of 2.",
      ]);
    });

    it("paginates", async () => {
      const { workspace, globalSpace, authenticator } =
        await createResourceTest({ role: "admin" });

      for (const name of ["Zzjira", "Zzjenkins", "Zznotion"]) {
        const server = await RemoteMCPServerFactory.create(workspace, { name });
        await MCPServerViewFactory.create(workspace, server.sId, globalSpace);
      }

      const lines = await callToolLines(
        "list_tools",
        { namePrefix: "zzj", limit: 1 },
        authenticator
      );

      expect(lines).toEqual([
        expect.stringContaining("Zzjenkins"),
        "Showing 1 of 2. Pass cursor: 1 for the next page.",
      ]);
    });

    it("reports when nothing matches", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const text = await callTool(
        "list_tools",
        { namePrefix: "zz" },
        authenticator
      );

      expect(text).toBe("No tools found.");
    });
  });

  describe("get_tool_details", () => {
    it("returns the server's functions with their parameters", async () => {
      const { workspace, globalSpace, authenticator } =
        await createResourceTest({ role: "user" });

      const server = await RemoteMCPServerFactory.create(workspace, {
        name: "LinkedIn",
        description: "Search and enrich LinkedIn profiles",
        tools: [
          {
            name: "search_user",
            description: "Search for a person by name",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Full name to search for",
                },
              },
              required: ["name"],
            },
          },
        ],
      });
      const view = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace
      );

      const text = await callTool(
        "get_tool_details",
        { toolId: view.sId },
        authenticator
      );

      expect(text).toContain(`MCP: LinkedIn (${view.sId})`);
      expect(text).toContain("Search and enrich LinkedIn profiles");
      expect(text).toContain("- search_user");
      expect(text).toContain("name (string): Full name to search for");
    });

    it("hides the tools of a space the caller cannot read", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "user",
      });
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const server = await RemoteMCPServerFactory.create(workspace, {
        name: "Hidden Server",
      });
      const view = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        restrictedSpace
      );

      const text = await callTool(
        "get_tool_details",
        { toolId: view.sId },
        authenticator
      );

      expect(text).toContain("No tool found");
      expect(text).not.toContain("Hidden Server");
    });

    it("reports an unknown tool without failing", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const text = await callTool(
        "get_tool_details",
        { toolId: "does-not-exist" },
        authenticator
      );

      expect(text).toContain("No tool found");
    });
  });

  // Search mode needs the core API, so only browse mode is covered here, like the copilot's tests.
  describe("search_knowledge", () => {
    it("lists the knowledge sources of readable spaces in browse mode", async () => {
      const { workspace, globalSpace, authenticator } =
        await createResourceTest({ role: "user" });
      const restrictedSpace = await SpaceFactory.regular(workspace);

      const visible = await DataSourceViewFactory.folder(
        workspace,
        globalSpace
      );
      await DataSourceViewFactory.folder(workspace, restrictedSpace);

      const text = await callTool("search_knowledge", {}, authenticator);
      const parsed: {
        dataSourceViews: { dataSourceViewId: string; spaceId: string }[];
        nodes: unknown[];
      } = JSON.parse(text);

      expect(parsed.nodes).toEqual([]);
      expect(parsed.dataSourceViews.map((dsv) => dsv.dataSourceViewId)).toEqual(
        [visible.sId]
      );
      expect(parsed.dataSourceViews[0].spaceId).toBe(globalSpace.sId);
    });

    it("filters by category", async () => {
      const { workspace, globalSpace, authenticator } =
        await createResourceTest({ role: "admin" });
      await DataSourceViewFactory.folder(workspace, globalSpace);

      const text = await callTool(
        "search_knowledge",
        { category: "website" },
        authenticator
      );
      const parsed: { dataSourceViews: unknown[] } = JSON.parse(text);

      expect(parsed.dataSourceViews).toEqual([]);
    });

    it("reports a workspace without knowledge", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const text = await callTool("search_knowledge", {}, authenticator);

      expect(JSON.parse(text)).toEqual({
        dataSourceViews: [],
        nodes: [],
        message: "No knowledge sources found in the workspace.",
      });
    });
  });
});
