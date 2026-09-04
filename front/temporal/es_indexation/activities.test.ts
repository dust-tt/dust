import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { deleteSkillDocument } from "@app/lib/skill_search";
import { indexSkillSearchActivity } from "@app/temporal/es_indexation/activities";
import { Err } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/skill_search", async (importActual) => {
  const actual = await importActual<typeof import("@app/lib/skill_search")>();
  return { ...actual, deleteSkillDocument: vi.fn() };
});

describe("indexSkillSearchActivity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("propagates deletion errors so Temporal retries", async () => {
    vi.spyOn(Authenticator, "internalAdminForWorkspace").mockResolvedValue(
      {} as Authenticator
    );
    vi.spyOn(
      SkillSearchDocumentResource,
      "fetchSearchDocument"
    ).mockResolvedValue(null);
    const error = new ElasticsearchError("query_error", "index missing", 404);
    vi.mocked(deleteSkillDocument).mockResolvedValue(new Err(error));

    await expect(
      indexSkillSearchActivity({
        workspaceId: "workspace-1",
        skillId: "skill-1",
      })
    ).rejects.toBe(error);
  });
});
