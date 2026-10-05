import type { Authenticator } from "@app/lib/auth";
import type { UpdateSkillParams } from "@app/lib/resources/skill/skill_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: mockEmitAuditLogEvent };
});

function emittedActions(): string[] {
  return mockEmitAuditLogEvent.mock.calls.map(([event]) => event.action);
}

async function currentUpdateParams(
  auth: Authenticator,
  skill: SkillResource
): Promise<UpdateSkillParams> {
  return {
    agentFacingDescription: skill.agentFacingDescription,
    attachedKnowledge: await skill.getAttachedKnowledge(auth),
    icon: skill.icon,
    instructions: skill.instructions,
    manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
    mcpServerViews: skill.mcpServerViews,
    name: skill.name,
    requestedSpaceIds: skill.requestedSpaceIds,
    userFacingDescription: skill.userFacingDescription,
  };
}

describe("SkillResource audit logs", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    ({ authenticator: auth } = await createResourceTest({ role: "admin" }));
    mockEmitAuditLogEvent.mockClear();
  });

  it("emits skill.created for an active skill, targeting the skill", async () => {
    const skill = await SkillFactory.create(auth, { name: "Created skill" });

    expect(emittedActions()).toEqual(["skill.created"]);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({ type: "workspace" }),
          { type: "skill", id: skill.sId, name: "Created skill" },
        ],
        metadata: { skill_name: "Created skill" },
      })
    );
  });

  it("emits skill.created, not skill.updated, when a pending skill is activated", async () => {
    const pendingRes = await SkillResource.createPending(auth);
    assert(pendingRes.isOk());
    const skill = pendingRes.value;
    expect(emittedActions()).toEqual([]);

    await skill.updateSkill(
      auth,
      {
        ...(await currentUpdateParams(auth, skill)),
        name: "Activated skill",
        status: "active",
      },
      { auditMetadata: { suggestion_batch_id: "batch_1" } }
    );

    expect(emittedActions()).toEqual(["skill.created"]);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          skill_name: "Activated skill",
          suggestion_batch_id: "batch_1",
        },
      })
    );
  });

  it("emits skill.updated, and skill.availability_updated on a change, when an active skill is saved", async () => {
    const skill = await SkillFactory.create(auth);
    mockEmitAuditLogEvent.mockClear();

    await skill.updateSkill(auth, {
      ...(await currentUpdateParams(auth, skill)),
      availability: "workspace_users",
    });

    expect(emittedActions()).toEqual([
      "skill.updated",
      "skill.availability_updated",
    ]);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "skill.availability_updated",
        metadata: {
          skill_name: skill.name,
          previous_availability: "editors",
          new_availability: "workspace_users",
        },
      })
    );
  });

  it("emits skill.archived and skill.restored for an active skill", async () => {
    const skill = await SkillFactory.create(auth);
    mockEmitAuditLogEvent.mockClear();

    await skill.archive(auth);
    await skill.restore(auth);

    expect(emittedActions()).toEqual(["skill.archived", "skill.restored"]);
  });

  it("emits nothing when a suggested skill is created or rejected", async () => {
    const skill = await SkillFactory.create(auth, { status: "suggested" });
    await skill.archive(auth);

    expect(emittedActions()).toEqual([]);
  });

  it("emits skill.editors_updated when editors are added or removed", async () => {
    const skill = await SkillFactory.create(auth);
    const editor = await UserFactory.basic();
    await MembershipFactory.associate(auth.getNonNullableWorkspace(), editor, {
      role: "user",
    });
    mockEmitAuditLogEvent.mockClear();

    expect((await skill.addEditors(auth, [editor])).isOk()).toBe(true);
    expect((await skill.removeEditors(auth, [editor])).isOk()).toBe(true);

    expect(
      mockEmitAuditLogEvent.mock.calls.map(([event]) => event.metadata)
    ).toEqual([
      {
        skill_name: skill.name,
        added_editor_ids: editor.sId,
        removed_editor_ids: "",
        actor_added_self: "false",
      },
      {
        skill_name: skill.name,
        added_editor_ids: "",
        removed_editor_ids: editor.sId,
        actor_added_self: "false",
      },
    ]);
  });
});
