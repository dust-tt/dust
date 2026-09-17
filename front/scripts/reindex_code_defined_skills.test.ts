import { getClient } from "@app/lib/api/elasticsearch";
import { GLOBAL_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/global";
import { SYSTEM_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/system";
import logger from "@app/logger/logger";
import {
  getCodeDefinedSkillSearchDocuments,
  reindexCodeDefinedSkills,
} from "@app/scripts/reindex_code_defined_skills";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/api/elasticsearch")>()),
  getClient: vi.fn(),
}));

describe("reindex code-defined skills", () => {
  const bulk = vi.fn();
  const deleteByQuery = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();
    const { Client } = await import("@elastic/elasticsearch");
    const client = new Client({ node: "http://localhost:9200" });
    client.bulk = bulk;
    client.deleteByQuery = deleteByQuery;
    vi.mocked(getClient).mockResolvedValue(client);
    bulk.mockResolvedValue({ errors: false });
    deleteByQuery.mockResolvedValue({ deleted: 1 });
  });

  it("projects every registered definition without private content or workspace-specific fields", () => {
    const definitions = [...GLOBAL_SKILLS_ARRAY, ...SYSTEM_SKILLS_ARRAY];
    const documents = getCodeDefinedSkillSearchDocuments();
    expect(documents).toHaveLength(definitions.length);
    for (const [index, definition] of definitions.entries()) {
      expect(documents[index]).toEqual({
        workspace_id: "global",
        skill_id: definition.sId,
        name: definition.name,
        description: definition.userFacingDescription,
        icon: definition.icon,
        status: "active",
        availability:
          definition.kind === "global" ? "users_and_agents" : "workspace_users",
        editor_ids: [],
        requested_space_ids: [],
        mcp_server_view_ids: [],
        last_edited_by_user_id: null,
        active_users_count: null,
        favorite_count: 0,
        created_at: new Date(0).toISOString(),
        updated_at: expect.any(String),
      });
    }
  });

  it("does not connect to ES on a dry run", async () => {
    await reindexCodeDefinedSkills(false, logger);
    expect(getClient).not.toHaveBeenCalled();
  });

  it("bulk upserts deterministic IDs before deleting only obsolete global documents", async () => {
    await reindexCodeDefinedSkills(true, logger);
    const skillIds = getCodeDefinedSkillSearchDocuments().map(
      (skill) => skill.skill_id
    );
    expect(
      bulk.mock.calls[0][0].operations.filter(
        (_: unknown, index: number) => index % 2 === 0
      )
    ).toEqual(
      skillIds.map((skillId) => ({
        index: { _index: "front.skills", _id: `global_${skillId}` },
      }))
    );
    expect(deleteByQuery).toHaveBeenCalledWith({
      index: "front.skills",
      query: {
        bool: {
          filter: [{ term: { workspace_id: "global" } }],
          must_not: [{ terms: { skill_id: skillIds } }],
        },
      },
      refresh: true,
    });
    expect(bulk.mock.invocationCallOrder[0]).toBeLessThan(
      deleteByQuery.mock.invocationCallOrder[0]
    );
  });

  it("does not prune after a partial bulk failure", async () => {
    bulk.mockResolvedValue({ errors: true });
    await expect(reindexCodeDefinedSkills(true, logger)).rejects.toThrow(
      "obsolete documents were not deleted"
    );
    expect(deleteByQuery).not.toHaveBeenCalled();
  });
});
