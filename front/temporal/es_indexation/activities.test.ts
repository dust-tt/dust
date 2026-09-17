import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import * as skillIndex from "@app/lib/skill_search";
import {
  deleteSkillSearchActivity,
  deleteWorkspaceSkillSearchActivity,
} from "@app/temporal/es_indexation/activities";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("skill search indexation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
