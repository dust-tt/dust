import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import baseLogger from "@app/logger/logger";
import { restoreEditorlessAgentAuthors } from "@app/migrations/20260922_restore_editorless_agent_authors";
import * as searchIndexationClient from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { Err, Ok } from "@app/types/shared/result";
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
      .spyOn(searchIndexationClient, "launchIndexAgentSearchWorkflow")
      .mockResolvedValue(new Ok(undefined));
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
    expect(launchSearchIndexation).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: editorlessAgent.sId,
    });

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

  it("retries failed search workflow launches", async () => {
    const launchSearchIndexation = vi
      .spyOn(searchIndexationClient, "launchIndexAgentSearchWorkflow")
      .mockResolvedValue(new Ok(undefined));
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Editorless agent",
    });
    await replaceEditors(auth, agent, []);
    launchSearchIndexation.mockReset();
    launchSearchIndexation
      .mockResolvedValueOnce(new Err(new Error("Temporal unavailable")))
      .mockResolvedValueOnce(new Err(new Error("Temporal unavailable")))
      .mockResolvedValueOnce(new Ok(undefined));

    await restoreEditorlessAgentAuthors({
      execute: true,
      logger,
      wId: workspace.sId,
    });

    expect(launchSearchIndexation).toHaveBeenCalledTimes(3);
  });

  it("waits for every in-flight repair before propagating a failure", async () => {
    vi.spyOn(
      searchIndexationClient,
      "launchIndexAgentSearchWorkflow"
    ).mockResolvedValue(new Ok(undefined));
    const {
      authenticator: auth,
      user,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const firstAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "First editorless agent",
    });
    const secondAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Second editorless agent",
    });
    const firstResource = await replaceEditors(auth, firstAgent, []);
    const secondResource = await replaceEditors(auth, secondAgent, []);

    const originalGrantToUser = GroupPermissionResource.grantToUser;
    let releaseSecondGrant: () => void = () => undefined;
    const secondGrantGate = new Promise<void>((resolve) => {
      releaseSecondGrant = resolve;
    });
    let markSecondGrantStarted: () => void = () => undefined;
    const secondGrantStarted = new Promise<void>((resolve) => {
      markSecondGrantStarted = resolve;
    });
    vi.spyOn(GroupPermissionResource, "grantToUser").mockImplementation(
      async (grantAuth, grant) => {
        if (grant.resourceId === firstResource.id) {
          throw new Error("Failed first repair");
        }
        if (grant.resourceId === secondResource.id) {
          markSecondGrantStarted();
          await secondGrantGate;
        }
        return originalGrantToUser.call(
          GroupPermissionResource,
          grantAuth,
          grant
        );
      }
    );

    let settled = false;
    const run = restoreEditorlessAgentAuthors({
      execute: true,
      logger,
      wId: workspace.sId,
    }).finally(() => {
      settled = true;
    });
    await secondGrantStarted;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    releaseSecondGrant();
    await expect(run).rejects.toThrow("Failed first repair");
    expect(await editorIds(auth, firstResource)).toEqual([]);
    expect(await editorIds(auth, secondResource)).toEqual([user.sId]);
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
