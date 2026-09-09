import { agentSearchIndex } from "@app/lib/agent_search";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import * as searchUsage from "@app/lib/search/usage";
import * as skillIndex from "@app/lib/skill_search";
import { deleteSkillDocument } from "@app/lib/skill_search";
import {
  indexAgentSearchActivity,
  indexSkillSearchActivity,
  refreshWorkspaceSearchUsageActivity,
} from "@app/temporal/es_indexation/activities";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/skill_search", async (importActual) => {
  const actual = await importActual<typeof import("@app/lib/skill_search")>();
  return { ...actual, deleteSkillDocument: vi.fn() };
});

describe("agent indexation and daily search usage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("indexes the latest committed agent and deletes it after archive, propagating ES failures", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await AgentConfigurationFactory.updateTestAgent(auth, agent.sId, {
      name: "Latest",
    });
    const upsert = vi
      .spyOn(agentSearchIndex, "upsert")
      .mockResolvedValue(new Ok(undefined));
    const deletion = vi
      .spyOn(agentSearchIndex, "delete")
      .mockResolvedValue(new Ok(undefined));
    await indexAgentSearchActivity({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: agent.sId,
        workspace_id: workspace.sId,
        name: "Latest",
        metadata: expect.objectContaining({ version: 1 }),
      })
    );
    await AgentResource.archiveAgentConfiguration(auth, agent.sId);
    await indexAgentSearchActivity({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
    expect(deletion).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      resourceId: agent.sId,
    });
    const error = new ElasticsearchError("query_error", "Delete failed");
    deletion.mockResolvedValue(new Err(error));
    await expect(
      indexAgentSearchActivity({
        workspaceId: workspace.sId,
        agentId: agent.sId,
      })
    ).rejects.toBe(error);
  });

  it("refreshes both resource types in one workspace and includes unused resources for zero resets", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const unused = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Unused",
    });
    const usage = vi
      .spyOn(searchUsage, "fetchSearchActiveUsers")
      .mockResolvedValueOnce(new Ok({ [skill.sId]: 3 }))
      .mockResolvedValueOnce(
        new Ok({ [agent.sId]: 7, [GLOBAL_AGENTS_SID.HELPER]: 4 })
      );
    const skills = vi
      .spyOn(skillIndex, "updateSkillSearchActiveUsers")
      .mockResolvedValue(new Ok(undefined));
    const agents = vi
      .spyOn(agentSearchIndex, "updateActiveUsers")
      .mockResolvedValue(new Ok(undefined));
    const evaluatedAtMs = Date.parse("2026-09-08T03:00:00Z");
    await refreshWorkspaceSearchUsageActivity({
      workspaceId: workspace.sId,
      evaluatedAtMs,
    });
    expect(usage.mock.calls.map(([input]) => input)).toEqual([
      { workspaceId: workspace.sId, evaluatedAtMs, resourceType: "skill" },
      { workspaceId: workspace.sId, evaluatedAtMs, resourceType: "agent" },
    ]);
    expect(skills).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillIds: [skill.sId],
      activeUsers: { [skill.sId]: 3 },
    });
    expect(agents).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      resourceIds: [agent.sId, unused.sId],
      activeUsers: { [agent.sId]: 7, [GLOBAL_AGENTS_SID.HELPER]: 4 },
    });
    expect(
      await searchUsage.readCodeDefinedActiveUsers({
        workspaceId: workspace.sId,
        resourceType: "agent",
      })
    ).toEqual({ [GLOBAL_AGENTS_SID.HELPER]: 4 });
  });
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
