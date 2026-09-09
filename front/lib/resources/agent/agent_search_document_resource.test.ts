import {
  archiveAgentConfiguration,
  updateAgentPermissions,
} from "@app/lib/api/assistant/configuration/agent";
import { setAgentUserFavorite } from "@app/lib/api/assistant/user_relation";
import { Authenticator } from "@app/lib/auth";
import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("AgentSearchDocumentResource", () => {
  let context: Awaited<ReturnType<typeof createResourceTest>>;
  beforeEach(async () => {
    context = await createResourceTest({ role: "admin" });
  });

  it("projects one complete latest version with a stable identity and no private content", async () => {
    const { authenticator: auth, workspace, globalSpace } = context;
    const original = await AgentConfigurationFactory.createTestAgent(auth);
    const agent = await AgentConfigurationFactory.updateTestAgent(
      auth,
      original.sId,
      { name: "Latest agent" }
    );
    const identity = await AgentResource.fetchByAgentConfiguration(auth, agent);
    const server = await RemoteMCPServerFactory.create(workspace);
    const tool = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    await AgentMCPServerConfigurationFactory.create(auth, globalSpace, {
      agent,
      mcpServerView: tool,
    });
    const skill = await SkillFactory.create(auth);
    await skill.addToAgent(auth, agent);
    const tag = await TagFactory.create(workspace, { name: "Search test" });
    await tag.addToAgent(auth, agent);
    expect(
      (
        await setAgentUserFavorite({
          auth,
          agentId: agent.sId,
          userFavorite: true,
        })
      ).isOk()
    ).toBe(true);

    const [document] = await AgentSearchDocumentResource.fetchSearchDocuments(
      auth,
      [agent.sId, agent.sId]
    );
    expect(document).toMatchObject({
      workspace_id: workspace.sId,
      agent_id: agent.sId,
      agent_model_id: identity.id,
      name: "Latest agent",
      availability: "workspace_users",
      editor_user_ids: [context.user.id],
      tools: [tool.sId],
      skills: [skill.sId],
      tags: [tag.sId],
      favorite_count: 1,
      active_users: 0,
      feedbacks: 0,
      metadata: { id: agent.id, version: 1 },
    });
    expect(JSON.stringify(document)).not.toContain("Updated Test Instructions");
    expect(JSON.stringify(document)).not.toContain("instructions");
    expect(JSON.stringify(document)).not.toContain("secretName");
    const serialized = AgentSearchDocumentResource.toSearchJSON(document, {
      canRead: true,
      canEdit: true,
    });
    expect(serialized.instructions).toBeNull();
    expect(serialized.tags).toEqual([tag.toJSON()]);
    expect(serialized.sId).toBe(original.sId);
  });

  it("removes archived agents, isolates workspaces, and rejects invalid space references", async () => {
    const { authenticator: auth } = context;
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const other = await createResourceTest({ role: "admin" });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(
        other.authenticator,
        agent.sId
      )
    ).toBeNull();
    await archiveAgentConfiguration(auth, agent.sId);
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toBeNull();
    const invalid = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Foreign space",
      requestedSpaceIds: [other.globalSpace.id],
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, invalid.sId)
    ).toBeNull();
  });

  it("enforces all spaces and editors, with admin-only metadata redaction and live revocation", async () => {
    const { authenticator: admin, workspace } = context;
    const pod = await SpaceFactory.project(workspace, context.user.id);
    const hidden = await AgentConfigurationFactory.createTestAgent(admin, {
      scope: "hidden",
      requestedSpaceIds: [pod.id],
    });
    const editor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editor, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      editor.sId,
      workspace.sId
    );
    const changed = await updateAgentPermissions(admin, {
      agent: hidden,
      usersToAdd: [editor.toJSON()],
      usersToRemove: [],
    });
    expect(changed.isOk()).toBe(true);
    await userAuth.refresh();
    const document = await AgentSearchDocumentResource.fetchSearchDocument(
      admin,
      hidden.sId
    );
    expect(document).not.toBeNull();
    if (!document) {
      throw new Error("Missing fixture document");
    }
    expect(
      (
        await AgentSearchDocumentResource.authorizeSearchDocuments(userAuth, [
          document,
        ])
      ).size
    ).toBe(0);
    await expect(
      AgentSearchDocumentResource.authorizeSearchDocuments(
        userAuth,
        [document],
        "redact_unreadable"
      )
    ).rejects.toThrow();
    const otherAdmin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherAdmin, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherAdmin.sId,
      workspace.sId
    );
    const redacted = await AgentSearchDocumentResource.authorizeSearchDocuments(
      adminAuth,
      [document],
      "redact_unreadable"
    );
    expect(redacted.get(hidden.sId)).toMatchObject({
      canRead: false,
      canEdit: false,
      instructions: null,
    });
    expect(redacted.get(hidden.sId)).not.toHaveProperty("actions");

    const readable = await AgentConfigurationFactory.createTestAgent(admin, {
      name: "Editor only",
      scope: "hidden",
    });
    await updateAgentPermissions(admin, {
      agent: readable,
      usersToAdd: [editor.toJSON()],
      usersToRemove: [],
    });
    await userAuth.refresh();
    const readableDoc = await AgentSearchDocumentResource.fetchSearchDocument(
      admin,
      readable.sId
    );
    if (!readableDoc) {
      throw new Error("Missing fixture document");
    }
    expect(
      (
        await AgentSearchDocumentResource.authorizeSearchDocuments(userAuth, [
          readableDoc,
        ])
      ).get(readable.sId)?.canRead
    ).toBe(true);
    await updateAgentPermissions(admin, {
      agent: readable,
      usersToAdd: [],
      usersToRemove: [editor.toJSON()],
    });
    expect(
      (
        await AgentSearchDocumentResource.authorizeSearchDocuments(userAuth, [
          readableDoc,
        ])
      ).size
    ).toBe(0);
  });
});
