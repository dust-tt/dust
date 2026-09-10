import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import * as skillIndex from "@app/lib/skill_search";
import * as searchUsage from "@app/lib/skill_search/usage";
import {
  indexSkillSearchActivity,
  refreshWorkspaceSearchUsageActivity,
} from "@app/temporal/es_indexation/activities";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("skill search indexation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes workspace usage including unused skills for zero resets", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    const unused = await SkillFactory.create(auth, { name: "Unused skill" });
    const usage = vi
      .spyOn(searchUsage, "fetchSearchActiveUsers")
      .mockResolvedValue(new Ok({ [skill.sId]: 3, "go-deep": 4 }));
    const updated = vi
      .spyOn(skillIndex, "updateSkillSearchActiveUsers")
      .mockResolvedValue(new Ok(undefined));
    const evaluatedAtMs = Date.parse("2026-09-08T03:00:00Z");
    await refreshWorkspaceSearchUsageActivity({
      workspaceId: workspace.sId,
      evaluatedAtMs,
    });
    expect(usage).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      evaluatedAtMs,
    });
    expect(updated).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillIds: [skill.sId, unused.sId],
      activeUsers: { [skill.sId]: 3, "go-deep": 4 },
    });
    const snapshot = await searchUsage.readCodeDefinedSkillActiveUsers(
      workspace.sId
    );
    expect(snapshot).toEqual({ "go-deep": 4 });
  });

  it("propagates deletion errors so Temporal retries", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    vi.spyOn(
      SkillSearchDocumentResource,
      "fetchSearchDocument"
    ).mockResolvedValue(null);
    const error = new ElasticsearchError("query_error", "index missing", 404);
    vi.spyOn(skillIndex, "deleteSkillDocument").mockResolvedValue(
      new Err(error)
    );
    const indexation = indexSkillSearchActivity({
      workspaceId: workspace.sId,
      skillId: "skill-1",
    });
    await expect(indexation).rejects.toBe(error);
  });
});
