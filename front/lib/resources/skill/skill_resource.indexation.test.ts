import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { withTransaction } from "@app/lib/utils/sql_utils";
import {
  launchIndexAgentSearchWorkflow,
  launchIndexSkillSearchWorkflow,
} from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

describe("resource-owned skill search indexation", () => {
  it("refreshes agent skill lists after standalone attachments and skill deletion", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    const first = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "First linked agent",
    });
    const second = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Second linked agent",
    });
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    await skill.addToAgent(auth, first);
    await SkillResource.addManyToAgent(auth, {
      agentConfiguration: second,
      skills: [skill],
    });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledTimes(2);
    for (const agent of [first, second]) {
      expect(
        await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
      ).toMatchObject({ skills: [skill.sId] });
    }

    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    expect((await skill.delete(auth)).isOk()).toBe(true);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledTimes(2);
    for (const agent of [first, second]) {
      expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledWith({
        workspaceId: workspace.sId,
        agentId: agent.sId,
      });
      expect(
        await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
      ).toMatchObject({ skills: [] });
    }
  });

  it("rolls back skill attachments without indexing and rejects a foreign agent", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(auth);
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const other = await createResourceTest({ role: "admin" });
    const foreign = await AgentConfigurationFactory.createTestAgent(
      other.authenticator
    );
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    const rollback = new Error("Rollback skill attachment");
    await expect(
      withTransaction(
        async (transaction) => {
          await skill.addToAgent(auth, agent, { transaction });
          expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(await SkillResource.listByAgentConfiguration(auth, agent)).toEqual(
      []
    );
    await expect(skill.addToAgent(auth, foreign)).rejects.toThrow(
      "Agent configuration must belong to the caller's workspace."
    );
    expect(
      await SkillResource.listByAgentConfiguration(other.authenticator, foreign)
    ).toEqual([]);
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
  });

  it("refreshes every changed parent after reference rewrites, but not after rollback", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const { childSkill, parentSkill } =
      await SkillFactory.createWithNestedSkill(auth, {
        childOverrides: { name: "Indexed child" },
        parentOverrides: { name: "First indexed parent" },
      });
    const secondParent = await SkillFactory.create(auth, {
      name: "Second indexed parent",
      instructions: `Use ${SkillFactory.serializeSkillReferenceTag(childSkill)}.`,
    });
    const parentIds = [parentSkill.sId, secondParent.sId];
    const before = await SkillSearchDocumentResource.fetchSearchDocuments(
      auth,
      parentIds
    );
    const rollback = new Error("Rollback parent references");
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    await expect(
      withTransaction(
        async (transaction) => {
          await childSkill.archive(auth, { transaction });
          expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(
      await SkillSearchDocumentResource.fetchSearchDocuments(auth, parentIds)
    ).toEqual(before);
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();

    const currentChild = await SkillResource.fetchById(auth, childSkill.sId);
    assert(currentChild);
    for (const mutate of [
      () => currentChild.archive(auth),
      () => currentChild.restore(auth),
      () => currentChild.delete(auth),
    ]) {
      vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
      await mutate();
      expect(
        new Set(
          vi
            .mocked(launchIndexSkillSearchWorkflow)
            .mock.calls.map(([target]) => target.skillId)
        )
      ).toEqual(new Set([childSkill.sId, ...parentIds]));
      const parents = await SkillResource.fetchByIds(auth, parentIds);
      const documents = await SkillSearchDocumentResource.fetchSearchDocuments(
        auth,
        parentIds
      );
      expect(documents.map((document) => document.updated_at)).toEqual(
        parents.map((parent) => parent.updatedAt.toISOString())
      );
    }
  });

  it("indexes committed creation, metadata, favorites and lifecycle changes without caller hooks", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth, {
      availability: "workspace_users",
    });
    const target = { workspaceId: workspace.sId, skillId: skill.sId };
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith(
      target
    );

    const mutations = [
      () => SkillResource.updateAvailabilities(auth, [skill], "editors"),
      () => skill.updateReinforcement(auth, "on"),
      () => skill.updateSelfImprovementLock(auth, true),
      () => skill.updateSelfImprovementCostsCap(auth, 100),
      () => skill.updateSelfImprovementCostsCapAwuCredits(auth, 10),
      () => skill.recordReinforcementAnalysisCompletion(auth),
      () => skill.setFavorite(auth, true),
      () => skill.archive(auth),
      () => skill.restore(auth),
    ];
    for (const mutate of mutations) {
      vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
      await mutate();
      expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith(
        target
      );
    }
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(auth, skill.sId)
    ).toMatchObject({
      availability: "editors",
      favorite_count: 1,
      metadata: {
        reinforcement: "on",
        selfImprovementLock: true,
        selfImprovementCostsCapMicroUsd: 100,
        selfImprovementCostsCapAwuCredits: 10,
        lastReinforcementAnalysisAt: expect.any(String),
      },
    });
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    expect((await skill.delete(auth)).isOk()).toBe(true);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith(
      target
    );
    expect(
      await SkillSearchDocumentResource.fetchSearchDocument(auth, skill.sId)
    ).toBeNull();
  });

  it("batches editors, rejects a mixed invalid batch without granting its valid prefix, and indexes success", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(auth);
    const editor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editor, { role: "user" });
    const outsider = await UserFactory.basic();
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();

    expect((await skill.addEditors(auth, [editor, outsider])).isErr()).toBe(
      true
    );
    expect((await skill.listEditors(auth))?.map((u) => u.id)).toEqual([
      user.id,
    ]);
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();

    expect((await skill.addEditors(auth, [editor, editor])).isOk()).toBe(true);
    expect((await skill.listEditors(auth))?.map((u) => u.id).sort()).toEqual(
      [user.id, editor.id].sort()
    );
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledTimes(1);
    expect((await skill.removeEditors(auth, [editor])).isOk()).toBe(true);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledTimes(2);
    expect((await skill.listEditors(auth))?.map((u) => u.id)).toEqual([
      user.id,
    ]);
  });

  it("rolls back skill, attachment, favorite and editor writes together without indexing", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(auth);
    const before = skill.toJSON(auth);
    const file = await FileFactory.csv(auth, user, {
      useCase: "skill_attachment",
    });
    const editor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editor, { role: "user" });
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    const rollback = new Error("Rollback skill mutation");
    await expect(
      withTransaction(
        async (transaction) => {
          await skill.updateSkill(
            auth,
            {
              name: "Updated search name",
              agentFacingDescription: "Updated agent description",
              userFacingDescription: "Updated description",
              instructions: "Updated instructions",
              icon: null,
              mcpServerViews: [],
              attachedKnowledge: [],
              requestedSpaceIds: [],
              manuallyRequestedSpaceIds: [],
              fileAttachments: [file],
            },
            { transaction }
          );
          await skill.setFavorite(auth, true, { transaction });
          await skill.addEditors(auth, [editor], { transaction });
          expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);

    const current = await SkillResource.fetchById(auth, skill.sId);
    assert(current);
    expect(current.toJSON(auth)).toEqual(before);
    expect(await current.isFavoriteForCurrentUser(auth)).toBe(false);
    expect((await current.listEditors(auth))?.map((u) => u.id)).toEqual([
      user.id,
    ]);
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
  });

  it("does not index a rolled-back creation", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    // Establish the factory's create permission before opening the savepoint.
    await SkillFactory.create(auth);
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    let skillId = "";
    const rollback = new Error("Rollback creation");
    await expect(
      withTransaction(
        async (transaction) => {
          const skill = await SkillResource.makeNew(
            auth,
            {
              name: "Rolled-back creation",
              status: "active",
              availability: "editors",
              agentFacingDescription: "Description",
              userFacingDescription: "Description",
              instructions: "Instructions",
              requestedSpaceIds: [],
              manuallyRequestedSpaceIds: [],
              editedBy: auth.getNonNullableUser().id,
            },
            { mcpServerViews: [], transaction }
          );
          skillId = skill.sId;
          expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(await SkillResource.fetchById(auth, skillId)).toBeNull();
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
  });

  it("waits for the outer commit, deduplicates IDs and never indexes a code-defined skill", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    await frontSequelize.transaction(async (outer) => {
      await frontSequelize.transaction(
        { transaction: outer },
        async (inner) => {
          await SkillResource.launchSearchIndexation(
            auth,
            [skill.sId, skill.sId, "go-deep"],
            { transaction: inner }
          );
        }
      );
      expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
    });
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
  });
});

import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
