import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import baseLogger from "@app/logger/logger";
import { restoreEditorlessAgentAuthors } from "@app/migrations/20260922_restore_editorless_agent_authors";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { UserType } from "@app/types/user";
import assert from "assert";
import { afterEach, describe, expect, it, vi } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

afterEach(() => {
  vi.restoreAllMocks();
});

async function replaceEditors(
  auth: Parameters<typeof AgentResource.fromAgentConfiguration>[0],
  agent: AgentConfigurationType,
  editors: UserType[]
) {
  const resource = AgentResource.fromAgentConfiguration(auth, agent);
  await withTransaction(async (transaction) => {
    const current = await resource.listEditors(auth, { transaction });
    assert(current);
    await resource.grantEditors(auth, { editors, transaction });
    await resource.revokeEditors(auth, {
      editors: current
        .filter((editor) => !editors.some(({ id }) => id === editor.id))
        .map((editor) => editor.toJSON()),
      transaction,
    });
  });
  return resource;
}

async function editorIds(
  auth: Parameters<AgentResource["listEditors"]>[0],
  resource: AgentResource
) {
  const editors = await resource.listEditors(auth);
  assert(editors);
  return editors.map((editor) => editor.sId).sort();
}

describe("restoreEditorlessAgentAuthors", () => {
  it("restores only editorless agents, with a dry run and idempotent rerun", async () => {
    const launchSearchIndexation = vi
      .spyOn(AgentResource, "launchSearchIndexation")
      .mockResolvedValue();
    const {
      authenticator: auth,
      user,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const otherEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherEditor, { role: "user" });

    const editorlessAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "Editorless agent" }
    );
    const agentWithEditor = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "Agent with editor" }
    );
    const agentWithGlobalEditor =
      await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent with global editor",
      });
    const editorlessResource = await replaceEditors(auth, editorlessAgent, []);
    const resourceWithEditor = await replaceEditors(auth, agentWithEditor, [
      otherEditor.toJSON(),
    ]);
    const resourceWithGlobalEditor = await replaceEditors(
      auth,
      agentWithGlobalEditor,
      []
    );
    await GroupPermissionResource.grantToEverybody(auth, {
      grantType: "editor",
      resourceType: "agent",
      resourceId: resourceWithGlobalEditor.id,
    });
    launchSearchIndexation.mockClear();

    await expect(
      restoreEditorlessAgentAuthors({
        execute: false,
        logger,
        wId: workspace.sId,
      })
    ).resolves.toEqual({
      editorlessAgentsFound: 1,
      authorsRestored: 0,
      agentsSkipped: 0,
    });
    expect(await editorIds(auth, editorlessResource)).toEqual([]);

    await expect(
      restoreEditorlessAgentAuthors({
        execute: true,
        logger,
        wId: workspace.sId,
      })
    ).resolves.toEqual({
      editorlessAgentsFound: 1,
      authorsRestored: 1,
      agentsSkipped: 0,
    });
    expect(await editorIds(auth, editorlessResource)).toEqual([user.sId]);
    expect(await editorIds(auth, resourceWithEditor)).toEqual([
      otherEditor.sId,
    ]);
    expect(await editorIds(auth, resourceWithGlobalEditor)).toEqual([]);
    expect(launchSearchIndexation).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      [editorlessAgent.sId]
    );

    await expect(
      restoreEditorlessAgentAuthors({
        execute: true,
        logger,
        wId: workspace.sId,
      })
    ).resolves.toEqual({
      editorlessAgentsFound: 0,
      authorsRestored: 0,
      agentsSkipped: 0,
    });
  });

  it("rejects an unknown workspace scope", async () => {
    await expect(
      restoreEditorlessAgentAuthors({
        execute: false,
        logger,
        wId: "missing-workspace",
      })
    ).rejects.toThrow("Workspace not found: missing-workspace");
  });
});
