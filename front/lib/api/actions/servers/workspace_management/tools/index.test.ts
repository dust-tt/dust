import { TOOLS } from "@app/lib/api/actions/servers/workspace_management/tools";
import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightWorkspaceType } from "@app/types/user";
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

async function callToolJson(
  name: string,
  params: Record<string, unknown>,
  auth: Authenticator
) {
  return JSON.parse(await callTool(name, params, auth));
}

// Creates, as another workspace member, one published agent, one unpublished agent the caller
// does not edit, and one published agent requesting a space the caller cannot read.
async function setupOtherMembersAgents(workspace: LightWorkspaceType) {
  const agentOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, agentOwner, { role: "builder" });
  const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    agentOwner.sId,
    workspace.sId
  );

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

    const { agents } = await callToolJson("list_agents", {}, authenticator);

    const names = agents.map((a: { name: string }) => a.name);
    expect(names).toContain("Published Agent");
    expect(names).not.toContain("Unpublished Agent");
    expect(names).not.toContain("Restricted Space Agent");
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

      const { agents, view } = await callToolJson(
        "list_agents",
        {},
        authenticator
      );

      expect(view).toBe("all");
      const names = agents.map((a: { name: string }) => a.name);
      expect(names).toContain("Published Agent");
      expect(names).not.toContain("Unpublished Agent");
      expect(names).not.toContain("Restricted Space Agent");
    });

    it("returns unpublished and restricted space agents with all_unrestricted", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      await setupOtherMembersAgents(workspace);

      const { agents } = await callToolJson(
        "list_agents",
        { view: "all_unrestricted" },
        authenticator
      );

      const names = agents.map((a: { name: string }) => a.name);
      expect(names).toContain("Published Agent");
      expect(names).toContain("Unpublished Agent");
      expect(names).toContain("Restricted Space Agent");
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
      const active = await callToolJson("list_agents", {}, authenticator);
      const activeNames = active.agents.map((a: { name: string }) => a.name);
      expect(activeNames).toContain(kept.name);
      expect(activeNames).not.toContain("Removed Agent");

      const archived = await callToolJson(
        "list_agents",
        { view: "archived" },
        authenticator
      );
      expect(archived.view).toBe("archived");
      expect(archived.agents).toEqual([
        expect.objectContaining({ name: "Removed Agent", status: "archived" }),
      ]);
    });

    it("returns the agent's scope, model and tags, and paginates", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      await AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "Aardvark Agent",
      });
      await AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "Zebra Agent",
      });

      const firstPage = await callToolJson(
        "list_agents",
        { namePrefix: "Aardvark", limit: 1 },
        authenticator
      );

      expect(firstPage.total).toBe(1);
      expect(firstPage.nextCursor).toBeNull();
      expect(firstPage.agents).toEqual([
        expect.objectContaining({
          name: "Aardvark Agent",
          scope: "visible",
          status: "active",
          model: "gpt-5-mini",
          tags: [],
          canEdit: true,
        }),
      ]);

      // Both agents match, so the first page must hand back a cursor for the second.
      const paged = await callToolJson(
        "list_agents",
        { namePrefix: "", limit: 1 },
        authenticator
      );
      expect(paged.total).toBeGreaterThan(1);
      expect(paged.nextCursor).toBe(1);
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

      const { skills } = await callToolJson("list_skills", {}, authenticator);

      expect(skills).toEqual([
        expect.objectContaining({
          name: "Discoverable Skill",
          availability: "users_and_agents",
          status: "active",
          kind: "custom",
          canWrite: true,
        }),
        expect.objectContaining({
          name: "Editors Only Skill",
          availability: "editors",
        }),
      ]);
      // Usage is opt-in.
      expect(skills[0]).not.toHaveProperty("agentsUsingCount");
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

      const { skills, total } = await callToolJson(
        "list_skills",
        { availability: ["users_and_agents"] },
        authenticator
      );

      expect(total).toBe(1);
      expect(skills[0].name).toBe("Discoverable Skill");
    });

    it("returns the agent count when includeUsage is set", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      await SkillFactory.create(authenticator, { name: "Unused Skill" });

      const { skills } = await callToolJson(
        "list_skills",
        { includeUsage: true },
        authenticator
      );

      expect(skills).toEqual([
        expect.objectContaining({ name: "Unused Skill", agentsUsingCount: 0 }),
      ]);
    });

    it("excludes archived skills unless asked for them", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      await SkillFactory.create(authenticator, {
        name: "Archived Skill",
        status: "archived",
      });

      const active = await callToolJson("list_skills", {}, authenticator);
      expect(active.total).toBe(0);

      const archived = await callToolJson(
        "list_skills",
        { status: "archived" },
        authenticator
      );
      expect(archived.skills).toEqual([
        expect.objectContaining({ name: "Archived Skill", status: "archived" }),
      ]);
    });
  });

  describe("get_skill_details", () => {
    it("returns a custom skill's instructions", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      const created = await SkillFactory.create(authenticator, {
        name: "Documented Skill",
        instructions: "Do the thing, then the other thing.",
      });

      const { skill } = await callToolJson(
        "get_skill_details",
        { skillId: created.sId },
        authenticator
      );

      expect(skill).toEqual(
        expect.objectContaining({
          sId: created.sId,
          name: "Documented Skill",
          kind: "custom",
          instructions: "Do the thing, then the other thing.",
          tools: [],
        })
      );
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
