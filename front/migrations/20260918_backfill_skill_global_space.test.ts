import {
  SkillConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import baseLogger from "@app/logger/logger";
import { backfillSkillGlobalSpace } from "@app/migrations/20260918_backfill_skill_global_space";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import assert from "assert";
import { describe, expect, it } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

describe("backfillSkillGlobalSpace", () => {
  it.each([
    "active",
    "archived",
    "suggested",
  ] as const)("repairs %s skills and snapshots without changing other fields or adding duplicates", async (status) => {
    const { authenticator, workspace, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.regular(workspace);
    const requestedSpaceIds = status === "active" ? [] : [space.id];
    const skill = await SkillFactory.create(authenticator, {
      status,
      requestedSpaceIds,
    });
    const row = await SkillConfigurationModel.findOne({
      where: { id: skill.id, workspaceId: workspace.id },
    });
    assert(row);
    const before = row.get({ plain: true });
    const { id: skillConfigurationId, ...snapshot } = before;
    const versionData = {
      ...snapshot,
      skillConfigurationId,
      version: 1,
      mcpServerViewIds: [],
      fileAttachmentIds: [],
    };
    const version = await SkillVersionModel.create(versionData);
    const versionBefore = version.get({ plain: true });

    await backfillSkillGlobalSpace({ workspace, execute: false, logger });
    await row.reload();
    await version.reload();
    expect(row.get({ plain: true })).toEqual(before);
    expect(version.get({ plain: true })).toEqual(versionBefore);

    // Both the initial execution and a retry must produce the same stored rows.
    for (let attempt = 0; attempt < 2; attempt++) {
      await backfillSkillGlobalSpace({ workspace, execute: true, logger });
      await row.reload();
      await version.reload();
      expect(row.get({ plain: true })).toEqual({
        ...before,
        requestedSpaceIds: [...requestedSpaceIds, globalSpace.id],
      });
      expect(version.get({ plain: true })).toEqual({
        ...versionBefore,
        requestedSpaceIds: [...requestedSpaceIds, globalSpace.id],
      });
    }
  });

  it("leaves already-correct skills and other workspaces untouched", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const other = await createResourceTest({ role: "admin" });
    const correctSkill = await SkillFactory.create(authenticator);
    const otherSkill = await SkillFactory.create(other.authenticator, {
      requestedSpaceIds: [],
    });
    const rows = await Promise.all([
      SkillConfigurationModel.findOne({
        where: { id: correctSkill.id, workspaceId: workspace.id },
      }),
      SkillConfigurationModel.findOne({
        where: { id: otherSkill.id, workspaceId: other.workspace.id },
      }),
    ]);
    const [correctRow, otherRow] = rows;
    assert(correctRow && otherRow);
    const correctBefore = correctRow.get({ plain: true });
    const otherBefore = otherRow.get({ plain: true });

    await backfillSkillGlobalSpace({ workspace, execute: true, logger });
    await correctRow.reload();
    await otherRow.reload();
    expect(correctRow.get({ plain: true })).toEqual(correctBefore);
    expect(otherRow.get({ plain: true })).toEqual(otherBefore);
  });
});
