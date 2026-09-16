import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import * as skillIndex from "@app/lib/skill_search";
import { indexSkillSearchActivity } from "@app/temporal/es_indexation/activities";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("skill search indexation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("propagates deletion errors so Temporal retries", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
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
