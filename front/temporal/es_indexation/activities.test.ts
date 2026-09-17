import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import * as skillIndex from "@app/lib/skill_search";
import * as searchUsage from "@app/lib/skill_search/usage";
import {
  deleteSkillSearchActivity,
  deleteWorkspaceSkillSearchActivity,
  refreshSearchUsageActivity,
  refreshWorkspaceSearchUsageActivity,
} from "@app/temporal/es_indexation/activities";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("skill search indexation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes all workspaces sequentially using the shared workspace helper", async () => {
    const first = await createResourceTest({ role: "admin" });
    const second = await createResourceTest({ role: "admin" });
    const firstSkill = await SkillFactory.create(first.authenticator);
    const secondSkill = await SkillFactory.create(second.authenticator);
    const events: string[] = [];
    vi.spyOn(searchUsage, "fetchSearchActiveUsers").mockImplementation(
      async ({ workspaceId }) => {
        events.push(`fetch:${workspaceId}`);
        return new Ok({});
      }
    );
    const updated = vi
      .spyOn(skillIndex, "updateSkillSearchActiveUsers")
      .mockImplementation(async ({ workspaceId }) => {
        events.push(`update:${workspaceId}`);
        return new Ok(undefined);
      });

    await refreshSearchUsageActivity();

    expect(events).toEqual([
      `fetch:${first.workspace.sId}`,
      `update:${first.workspace.sId}`,
      `fetch:${second.workspace.sId}`,
      `update:${second.workspace.sId}`,
    ]);
    expect(updated.mock.calls).toEqual([
      [
        {
          workspaceId: first.workspace.sId,
          skillIds: [firstSkill.sId],
          activeUsers: {},
        },
      ],
      [
        {
          workspaceId: second.workspace.sId,
          skillIds: [secondSkill.sId],
          activeUsers: {},
        },
      ],
    ]);
  });

  it("stops and propagates a workspace refresh failure so Temporal retries", async () => {
    const first = await createResourceTest({ role: "admin" });
    await createResourceTest({ role: "admin" });
    const error = new ElasticsearchError("query_error", "Usage refresh failed");
    const usage = vi
      .spyOn(searchUsage, "fetchSearchActiveUsers")
      .mockResolvedValue(new Err(error));
    const updated = vi
      .spyOn(skillIndex, "updateSkillSearchActiveUsers")
      .mockResolvedValue(new Ok(undefined));

    await expect(refreshSearchUsageActivity()).rejects.toBe(error);

    expect(usage).toHaveBeenCalledExactlyOnceWith({
      workspaceId: first.workspace.sId,
      evaluatedAtMs: expect.any(Number),
    });
    expect(updated).not.toHaveBeenCalled();
  });

  it("refreshes workspace usage including restricted and unused skills for zero resets", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    const space = await SpaceFactory.regular(workspace);
    const pod = await SpaceFactory.project(workspace);
    const unused = await SkillFactory.create(auth, {
      name: "Unused skill",
      requestedSpaceIds: [space.id],
    });
    const archived = await SkillFactory.create(auth, {
      name: "Archived skill",
      status: "archived",
      requestedSpaceIds: [pod.id],
    });
    const usage = vi
      .spyOn(searchUsage, "fetchSearchActiveUsers")
      .mockResolvedValue(new Ok({ [skill.sId]: 3, "go-deep": 4 }));
    const updated = vi
      .spyOn(skillIndex, "updateSkillSearchActiveUsers")
      .mockResolvedValue(new Ok(undefined));
    const evaluatedAtMs = Date.parse("2026-09-08T03:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(evaluatedAtMs);
    await refreshWorkspaceSearchUsageActivity({
      workspaceId: workspace.sId,
    });
    expect(usage).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      evaluatedAtMs,
    });
    expect(updated).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillIds: [skill.sId, unused.sId, archived.sId],
      activeUsers: { [skill.sId]: 3, "go-deep": 4 },
    });
  });

  it("deletes the requested skill and propagates errors so Temporal retries", async () => {
    const target = { workspaceId: "workspace-1", skillId: "skill-1" };
    const error = new ElasticsearchError("query_error", "index missing", 404);
    const deleteDocument = vi
      .spyOn(skillIndex, "deleteSkillDocument")
      .mockResolvedValue(new Err(error));

    await expect(deleteSkillSearchActivity(target)).rejects.toBe(error);
    expect(deleteDocument).toHaveBeenCalledExactlyOnceWith(target);
  });

  it("propagates workspace deletion errors so Temporal retries", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const error = new ElasticsearchError("query_error", "index missing", 404);
    vi.spyOn(skillIndex, "deleteWorkspaceSkillDocuments").mockResolvedValue(
      new Err(error)
    );
    const deletion = deleteWorkspaceSkillSearchActivity({
      workspaceId: workspace.sId,
    });
    await expect(deletion).rejects.toBe(error);
  });
});
