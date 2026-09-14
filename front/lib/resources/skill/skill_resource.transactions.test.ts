import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { describe, expect, it } from "vitest";

describe("atomic skill mutations", () => {
  it("batches editors without granting a valid prefix from an invalid batch", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(auth);
    const editor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editor, { role: "user" });
    const outsider = await UserFactory.basic();

    expect((await skill.addEditors(auth, [editor, outsider])).isErr()).toBe(
      true
    );
    expect((await skill.listEditors(auth))?.map((u) => u.id)).toEqual([
      user.id,
    ]);

    expect((await skill.addEditors(auth, [editor, editor])).isOk()).toBe(true);
    expect((await skill.listEditors(auth))?.map((u) => u.id).sort()).toEqual(
      [user.id, editor.id].sort()
    );
    expect((await skill.removeEditors(auth, [editor])).isOk()).toBe(true);
    expect((await skill.listEditors(auth))?.map((u) => u.id)).toEqual([
      user.id,
    ]);
  });

  it("rolls back skill, attachment, favorite and editor writes together", async () => {
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
    const rollback = new Error("Rollback skill mutation");
    await expect(
      withTransaction((parent) =>
        frontSequelize.transaction(
          { transaction: parent },
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
            throw rollback;
          }
        )
      )
    ).rejects.toBe(rollback);

    const current = await SkillResource.fetchById(auth, skill.sId);
    assert(current);
    expect(current.toJSON(auth)).toEqual(before);
    expect(await current.isFavoriteForCurrentUser(auth)).toBe(false);
    expect((await current.listEditors(auth))?.map((u) => u.id)).toEqual([
      user.id,
    ]);
  });
});
