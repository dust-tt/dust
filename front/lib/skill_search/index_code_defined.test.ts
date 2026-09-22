import config from "@app/lib/api/config";
import { GLOBAL_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/global";
import { SYSTEM_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/system";
import { makeSkillDocumentId } from "@app/lib/skill_search";
import { CODE_DEFINED_SKILLS_WORKSPACE_ID } from "@app/lib/skill_search/constants";
import { reindexCodeDefinedSkills } from "@app/lib/skill_search/index_code_defined";
import logger from "@app/logger/logger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ping: vi.fn(),
  bulk: vi.fn(),
  deleteByQuery: vi.fn(),
}));

vi.mock("@elastic/elasticsearch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@elastic/elasticsearch")>()),
  Client: vi.fn(function () {
    return mocks;
  }),
}));

describe("reindexCodeDefinedSkills", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(config, "getElasticsearchConfig").mockReturnValue({
      url: "http://localhost:9200",
      username: "test",
      password: "test",
    });
    mocks.ping.mockResolvedValue(true);
    mocks.bulk.mockResolvedValue({ errors: false });
    mocks.deleteByQuery.mockResolvedValue({ deleted: 1 });
  });

  it("upserts all definitions with stable IDs before pruning only obsolete global documents", async () => {
    const definitions = [...GLOBAL_SKILLS_ARRAY, ...SYSTEM_SKILLS_ARRAY];
    const result = await reindexCodeDefinedSkills();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ indexed: definitions.length, deleted: 1 });
    }
    expect(mocks.bulk).toHaveBeenCalledExactlyOnceWith({
      require_alias: true,
      operations: definitions.flatMap((skill) => [
        {
          index: {
            _index: "front.skills",
            _id: makeSkillDocumentId({
              workspaceId: CODE_DEFINED_SKILLS_WORKSPACE_ID,
              skillId: skill.sId,
            }),
          },
        },
        expect.objectContaining({
          workspace_id: CODE_DEFINED_SKILLS_WORKSPACE_ID,
          skill_id: skill.sId,
          name: skill.name,
          availability:
            skill.kind === "global" ? "users_and_agents" : "workspace_users",
          requested_space_ids: [],
          mcp_server_view_ids: [],
          child_skill_ids: [],
          active_users_count: null,
          created_at: null,
          updated_at: null,
        }),
      ]),
    });
    expect(mocks.bulk).toHaveBeenCalledBefore(mocks.deleteByQuery);
    expect(mocks.deleteByQuery).toHaveBeenCalledExactlyOnceWith({
      index: "front.skills",
      query: {
        bool: {
          filter: [
            { term: { workspace_id: CODE_DEFINED_SKILLS_WORKSPACE_ID } },
          ],
          must_not: [
            { terms: { skill_id: definitions.map((skill) => skill.sId) } },
          ],
        },
      },
    });

    await reindexCodeDefinedSkills();
    expect(mocks.bulk.mock.calls[1]).toEqual(mocks.bulk.mock.calls[0]);
  });

  it("does not prune when bulk indexing has partial failures", async () => {
    const failedItem = {
      index: {
        _id: "code_defined_go-deep",
        status: 400,
        error: {
          type: "mapper_parsing_exception",
          reason: "Failed to parse field [name]",
        },
      },
    };
    mocks.bulk.mockResolvedValue({
      errors: true,
      items: [
        { index: { _id: "code_defined_succeeded", status: 201 } },
        failedItem,
      ],
    });
    const logError = vi.spyOn(logger, "error");

    const result = await reindexCodeDefinedSkills();

    expect(result.isErr()).toBe(true);
    expect(mocks.deleteByQuery).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledExactlyOnceWith(
      { errors: [failedItem] },
      "Failed to index code-defined skills."
    );
  });

  it("does not prune when Elasticsearch rejects indexing", async () => {
    mocks.bulk.mockRejectedValue(new Error("Index unavailable"));

    const result = await reindexCodeDefinedSkills();

    expect(result.isErr()).toBe(true);
    expect(mocks.deleteByQuery).not.toHaveBeenCalled();
  });

  it.each([
    { timed_out: true },
    { failures: [{ cause: { type: "version_conflict_engine_exception" } }] },
  ])("reports incomplete cleanup: %j", async (response) => {
    mocks.deleteByQuery.mockResolvedValue(response);

    const result = await reindexCodeDefinedSkills();

    expect(result.isErr()).toBe(true);
  });
});
