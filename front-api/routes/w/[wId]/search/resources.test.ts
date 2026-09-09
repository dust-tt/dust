import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { Authenticator } from "@app/lib/auth";
import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import {
  compareRankedResources,
  getResourceMatchScore,
  getSearchRankingScore,
} from "@app/lib/search/ranking";
import {
  storeCodeDefinedActiveUsers,
  storeCodeDefinedSkillActiveUsers,
} from "@app/lib/search/usage";
import { launchIndexSkillSearchWorkflow } from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { AgentSearchDocument } from "@app/types/agent_search/agent_search";
import type { ResourceSearchResponse } from "@app/types/api/resource_search";
import {
  GLOBAL_AGENTS_SID,
  isGlobalAgentId,
} from "@app/types/assistant/assistant";
import type { SearchMode } from "@app/types/search";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isNumber, isString } from "@app/types/shared/utils/general";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.hoisted(() => vi.fn());
const mockOpenPit = vi.hoisted(() => vi.fn());
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  const { Ok } = await import("@app/types/shared/result");
  return {
    ...actual,
    withEs: async (
      fn: (client: {
        search: typeof mockSearch;
        openPointInTime: typeof mockOpenPit;
        closePointInTime: () => Promise<{ succeeded: boolean }>;
      }) => Promise<unknown>
    ) =>
      new Ok(
        await fn({
          search: mockSearch,
          openPointInTime: mockOpenPit,
          closePointInTime: async () => ({ succeeded: true }),
        })
      ),
  };
});

// Exercise the HTTP/search/resource path against the test DB, with external services mocked.
function serveDocuments(
  documents: (SkillSearchDocument | AgentSearchDocument)[],
  mode: SearchMode = "autocomplete",
  searchTerm = ""
) {
  const ordered = documents
    .map((document) => {
      const sId = isString(document.skill_id)
        ? document.skill_id
        : document.agent_id;
      assert(isString(sId));
      return {
        document,
        sId,
        name: document.name,
        score: getSearchRankingScore({
          mode,
          activeUsers: document.active_users,
          feedbacks: isNumber(document.feedbacks) ? document.feedbacks : 0,
          matchScore: getResourceMatchScore({
            mode,
            searchTerm,
            name: document.name,
            description: document.description ?? "",
          }),
        }),
      };
    })
    .filter(({ score }) => score > 0)
    .sort(compareRankedResources);
  mockSearch.mockImplementation(async (request: estypes.SearchRequest) => {
    const after = request.search_after?.[3];
    const offset = isNumber(after) ? after + 1 : 0;
    return {
      hits: {
        hits: ordered
          .slice(offset, offset + (request.size ?? 50))
          .map((hit, index) => ({
            _source: hit.document,
            sort: [hit.score, hit.name, hit.sId, offset + index],
          })),
      },
    };
  });
}

describe("GET /api/w/:wId/search/resources", () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockOpenPit.mockReset().mockResolvedValue({ id: "shared-pit" });
  });

  it.each([
    "manual",
    "provisioned",
    "everyone",
  ] as const)("enforces %s editor grants against unchanged index documents", async (kind) => {
    const { auth, workspace, user, globalGroup, globalSpace } =
      await createPrivateApiMockRequest({ role: "user" });
    const skill = await SkillFactory.create(auth, {
      name: "GrantAcl skill",
      availability: "editors",
      addCurrentUserAsEditor: false,
      requestedSpaceIds: [globalSpace.id],
    });
    let group: GroupResource;
    switch (kind) {
      case "everyone":
        group = globalGroup;
        break;
      case "manual":
        group = await GroupFactory.regularManual(workspace, "Search editors");
        break;
      case "provisioned":
        group = await GroupFactory.provisioned(workspace, "Search editors");
        break;
      default:
        assertNever(kind);
    }
    if (kind !== "everyone") {
      expect((await GroupFactory.withMembers(auth, group, [user])).isOk()).toBe(
        true
      );
    }
    await GroupPermissionResource.grant(auth, {
      group,
      grantType: "editor",
      resourceType: "skill",
      resourceId: skill.id,
    });
    await auth.refresh();
    expect(skill.canWrite(auth)).toBe(true);
    expect(await skill.listEditors(auth)).toEqual([]);
    const canonical = await SkillResource.listByWorkspace(auth, {
      availability: ["editors"],
    });
    expect(canonical.some((entry) => entry.sId === skill.sId)).toBe(true);
    const document = await SkillSearchDocumentResource.fetchSearchDocument(
      auth,
      skill.sId
    );
    assert(document);
    expect(document.editor_user_ids).toEqual([]);
    expect(document.editor_group_ids).toEqual([group.id]);
    serveDocuments([document], "autocomplete", "GrantAcl");
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?query=GrantAcl&resourceTypes=skill`
    );
    expect(response.status).toBe(200);
    const body: ResourceSearchResponse = await response.json();
    expect(body.results.map(({ resource }) => resource.sId)).toEqual([
      skill.sId,
    ]);
    const userQuery = JSON.stringify(mockSearch.mock.calls[0][0].query);
    expect(userQuery).toContain('"editor_group_ids":');

    if (kind === "everyone") {
      // New members use the indexed global-group grant, without rewriting any skill documents.
      vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
      const newcomer = await createPrivateApiMockRequest({ workspace });
      expect(skill.canWrite(newcomer.auth)).toBe(true);
      const joined = await honoApp.request(
        `/api/w/${workspace.sId}/search/resources?query=GrantAcl&resourceTypes=skill`
      );
      const joinedBody: ResourceSearchResponse = await joined.json();
      expect(joinedBody.results.map(({ resource }) => resource.sId)).toEqual([
        skill.sId,
      ]);
      expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
    } else {
      const removed = await group.dangerouslyRemoveMember(auth, {
        user: user.toJSON(),
        allowProvisionedGroups: true,
      });
      expect(removed.isOk()).toBe(true);
      await auth.refresh();
      const denied = await honoApp.request(
        `/api/w/${workspace.sId}/search/resources?query=GrantAcl&resourceTypes=skill`
      );
      const deniedBody: ResourceSearchResponse = await denied.json();
      expect(deniedBody.results).toEqual([]);
      expect((await GroupFactory.withMembers(auth, group, [user])).isOk()).toBe(
        true
      );
      await auth.refresh();
      const restored = await honoApp.request(
        `/api/w/${workspace.sId}/search/resources?query=GrantAcl&resourceTypes=skill`
      );
      const restoredBody: ResourceSearchResponse = await restored.json();
      expect(restoredBody.results.map(({ resource }) => resource.sId)).toEqual([
        skill.sId,
      ]);
    }
    await GroupPermissionResource.revoke(auth, {
      group,
      grantType: "editor",
      resourceType: "skill",
      resourceId: skill.id,
    });
    await auth.refresh();
    const revoked = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?query=GrantAcl&resourceTypes=skill`
    );
    const revokedBody: ResourceSearchResponse = await revoked.json();
    expect(revokedBody.results).toEqual([]);
  });

  it.each([
    "skill",
    "*",
  ] as const)("honors type-wide %s write grants without exposing private agents", async (resourceType) => {
    const { auth, workspace, globalGroup } = await createPrivateApiMockRequest({
      role: "user",
    });
    const skill = await SkillFactory.create(auth, {
      name: "WildcardAcl skill",
      availability: "editors",
      addCurrentUserAsEditor: false,
    });
    const pod = await SpaceFactory.project(workspace);
    const restricted = await SkillFactory.create(auth, {
      name: "WildcardAcl pod",
      availability: "editors",
      addCurrentUserAsEditor: false,
      requestedSpaceIds: [pod.id],
    });
    const author = await UserFactory.basic();
    await MembershipFactory.associate(workspace, author, { role: "user" });
    const authorAuth = await Authenticator.fromUserIdAndWorkspaceId(
      author.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(authorAuth, {
      name: "WildcardAcl private agent",
      scope: "hidden",
    });
    const documents = await SkillSearchDocumentResource.fetchSearchDocuments(
      auth,
      [skill.sId, restricted.sId]
    );
    const agentDocument = await AgentSearchDocumentResource.fetchSearchDocument(
      auth,
      agent.sId
    );
    assert(agentDocument);
    serveDocuments(
      [...documents, agentDocument],
      "autocomplete",
      "WildcardAcl"
    );
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    await GroupPermissionResource.grantTypeWide(auth, {
      group: globalGroup,
      grantType: "*",
      resourceType,
    });
    await auth.refresh();
    expect(skill.canWrite(auth)).toBe(true);
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?query=WildcardAcl`
    );
    expect(response.status).toBe(200);
    const body: ResourceSearchResponse = await response.json();
    expect(new Set(body.results.map(({ resource }) => resource.sId))).toEqual(
      new Set(resourceType === "*" ? [skill.sId, restricted.sId] : [skill.sId])
    );
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
    await GroupPermissionResource.revokeTypeWide(auth, {
      group: globalGroup,
      grantType: "*",
      resourceType,
    });
    await auth.refresh();
    const revoked = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?query=WildcardAcl`
    );
    const revokedBody: ResourceSearchResponse = await revoked.json();
    expect(revokedBody.results).toEqual([]);
  });

  it("preserves the existing knowledge search and tool-upload URLs", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    const knowledge = await honoApp.request(
      `/api/w/${workspace.sId}/search?limit=0`
    );
    expect(knowledge.status).toBe(400);
    const upload = await honoApp.request(
      `/api/w/${workspace.sId}/search/tools/upload`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect(upload.status).toBe(400);
    expect(mockOpenPit).not.toHaveBeenCalled();
  });

  it("paginates indexed and global skills and agents without losing displaced hits", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth, { name: "High usage skill" });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Lower usage agent",
    });
    const skillDocument = await SkillSearchDocumentResource.fetchSearchDocument(
      auth,
      skill.sId
    );
    const agentDocument = await AgentSearchDocumentResource.fetchSearchDocument(
      auth,
      agent.sId
    );
    assert(skillDocument && agentDocument);
    serveDocuments(
      [
        { ...skillDocument, active_users: 30 },
        { ...agentDocument, active_users: 10 },
      ],
      "management"
    );
    await storeCodeDefinedSkillActiveUsers(workspace.sId, { "go-deep": 20 });
    await storeCodeDefinedActiveUsers({
      workspaceId: workspace.sId,
      resourceType: "agent",
      counts: { [GLOBAL_AGENTS_SID.HELPER]: 25 },
    });
    const results: ResourceSearchResponse["results"] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 30; page++) {
      const response = await honoApp.request(
        `/api/w/${workspace.sId}/search/resources?mode=management&limit=1${cursor ? `&cursor=${cursor}` : ""}`
      );
      expect(response.status).toBe(200);
      const body: ResourceSearchResponse = await response.json();
      results.push(...body.results);
      cursor = body.nextCursor;
      if (!cursor) {
        break;
      }
    }
    expect(cursor).toBeNull();
    expect(
      results.slice(0, 4).map(({ type, resource }) => [type, resource.sId])
    ).toEqual([
      ["skill", skill.sId],
      ["agent", GLOBAL_AGENTS_SID.HELPER],
      ["skill", "go-deep"],
      ["agent", agent.sId],
    ]);
    const ids = results.map(({ resource }) => resource.sId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === agent.sId)).toHaveLength(1);
    const globals = await getGlobalAgents(auth, undefined, "light");
    expect(new Set(ids.filter(isGlobalAgentId))).toEqual(
      new Set(
        globals
          .filter((entry) => entry.status === "active")
          .map((entry) => entry.sId)
      )
    );
    expect(mockOpenPit).toHaveBeenCalledOnce();
    expect(mockOpenPit).toHaveBeenCalledWith({
      index: ["front.agents", "front.skills"],
      keep_alive: "300s",
    });
    for (const entry of results) {
      if (entry.type === "skill") {
        expect(entry.resource).toMatchObject({
          canRead: true,
          fileAttachments: [],
        });
        expect(entry.resource).not.toHaveProperty("instructions");
        expect(entry.resource).not.toHaveProperty("tools");
      } else {
        expect(entry.resource.instructions).toBeNull();
        expect(entry.resource).not.toHaveProperty("actions");
        expect(entry.resource).not.toHaveProperty("skills");
        expect(entry.resource).not.toHaveProperty("instructionsHtml");
      }
    }
  });

  it("uses current global availability and invalidates cursors after a catalog change", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Zzz custom",
    });
    const document = await AgentSearchDocumentResource.fetchSearchDocument(
      auth,
      agent.sId
    );
    assert(document);
    serveDocuments([document], "management");
    await storeCodeDefinedActiveUsers({
      workspaceId: workspace.sId,
      resourceType: "agent",
      counts: { [GLOBAL_AGENTS_SID.HELPER]: 100 },
    });
    const url = `/api/w/${workspace.sId}/search/resources?resourceTypes=agent&mode=management&limit=1`;
    const first = await honoApp.request(url);
    expect(first.status).toBe(200);
    const body: ResourceSearchResponse = await first.json();
    expect(body.results.map((entry) => entry.resource.sId)).toEqual([
      GLOBAL_AGENTS_SID.HELPER,
    ]);
    assert(body.nextCursor);

    const update = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/global_agents/${GLOBAL_AGENTS_SID.DUST}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disabled_by_admin" }),
      }
    );
    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({ success: true });
    expect(
      (await honoApp.request(`${url}&cursor=${body.nextCursor}`)).status
    ).toBe(400);
    const current = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?resourceTypes=agent&mode=management&limit=50`
    );
    expect(current.status).toBe(200);
    const currentBody: ResourceSearchResponse = await current.json();
    const ids = currentBody.results.map((entry) => entry.resource.sId);
    expect(ids).toContain(GLOBAL_AGENTS_SID.HELPER);
    expect(ids).not.toContain(GLOBAL_AGENTS_SID.DUST);
    expect(ids).not.toContain(GLOBAL_AGENTS_SID.SIDEKICK);
    expect(ids).not.toContain(GLOBAL_AGENTS_SID.GPT35_TURBO);
    expect(ids).not.toContain(GLOBAL_AGENTS_SID.NOOP);
    expect(ids).toContain(agent.sId);
  });

  it("matches global tool and skill filters without creating views or returning capabilities", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const views =
      await MCPServerViewResource.getMCPServerViewsForAutoInternalToolsAsMap(
        auth,
        ["web_search_&_browse"]
      );
    const web = views.get("web_search_&_browse");
    assert(web);
    const canonical = await getGlobalAgents(auth, undefined, "full");
    const ensureViews = vi.spyOn(
      MCPServerViewResource,
      "unsafeEnsureAutoViewsForWorkspace"
    );
    serveDocuments([]);
    const url = `/api/w/${workspace.sId}/search/resources?resourceTypes=agent&toolIds=${web.sId}&skillIds=frames`;
    const response = await honoApp.request(url);
    expect(response.status).toBe(200);
    const body: ResourceSearchResponse = await response.json();
    const expected = canonical.filter(
      (entry) =>
        entry.status === "active" &&
        entry.skills?.includes("frames") &&
        entry.actions.some(
          (action) =>
            isServerSideMCPServerConfiguration(action) &&
            action.mcpServerViewId === web.sId
        )
    );
    expect(expected.map((entry) => entry.sId)).toContain(
      GLOBAL_AGENTS_SID.HELPER
    );
    expect(new Set(body.results.map((entry) => entry.resource.sId))).toEqual(
      new Set(expected.map((entry) => entry.sId))
    );
    for (const entry of body.results) {
      expect(entry.resource).toMatchObject({
        scope: "global",
        canRead: true,
        instructions: null,
      });
      expect(entry.resource).not.toHaveProperty("actions");
      expect(entry.resource).not.toHaveProperty("skills");
      expect(entry.resource).not.toHaveProperty("instructionsHtml");
    }
    expect(ensureViews).not.toHaveBeenCalled();
    ensureViews.mockRestore();

    const filtered = await honoApp.request(`${url}&editedByMe=true`);
    expect(filtered.status).toBe(200);
    const filteredBody: ResourceSearchResponse = await filtered.json();
    expect(filteredBody.results).toEqual([]);
  });

  it("ranks globals by current feedback without counting another workspace's feedback", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const other = await createResourceTest({ role: "admin" });
    for (const actor of [auth, other.authenticator]) {
      const conversation = await ConversationFactory.create(actor, {
        agentConfigurationId: GLOBAL_AGENTS_SID.HELPER,
        messagesCreatedAt: [],
      });
      assert(conversation.id);
      const message = await ConversationFactory.createAgentMessageWithRank({
        workspace: actor.getNonNullableWorkspace(),
        conversationId: conversation.id,
        rank: 0,
        agentConfigurationId: GLOBAL_AGENTS_SID.HELPER,
      });
      assert(message.agentMessageId);
      await AgentMessageFeedbackResource.makeNew({
        workspaceId: actor.getNonNullableWorkspace().id,
        agentConfigurationId: GLOBAL_AGENTS_SID.HELPER,
        agentConfigurationVersion: 0,
        conversationId: conversation.id,
        agentMessageId: message.agentMessageId,
        userId: actor.getNonNullableUser().id,
        thumbDirection: "up",
        content: null,
        isConversationShared: false,
        dismissed: false,
      });
    }
    serveDocuments([], "discovery");
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?resourceTypes=agent&mode=discovery`
    );
    expect(response.status).toBe(200);
    const body: ResourceSearchResponse = await response.json();
    expect(body.results[0]).toMatchObject({
      type: "agent",
      resource: { sId: GLOBAL_AGENTS_SID.HELPER },
      score: Math.fround(1 + Math.log1p(1)),
    });
  });

  it("keeps audience-scoped globals hidden from ordinary members", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
      plan: "creditPriced",
    });
    serveDocuments([]);
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?resourceTypes=agent&limit=50`
    );
    expect(response.status).toBe(200);
    const body: ResourceSearchResponse = await response.json();
    const canonical = await getGlobalAgents(auth, undefined, "light");
    expect(new Set(body.results.map((entry) => entry.resource.sId))).toEqual(
      new Set(
        canonical
          .filter((entry) => entry.status === "active")
          .map((entry) => entry.sId)
      )
    );
    expect(body.results.map((entry) => entry.resource.sId)).not.toContain(
      GLOBAL_AGENTS_SID.ANALYST
    );
    expect(body.results.map((entry) => entry.resource.sId)).toContain(
      GLOBAL_AGENTS_SID.HELPER
    );
    const redacted = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?resourceTypes=agent&permissionFiltering=redact_unreadable`
    );
    expect(redacted.status).toBe(403);

    await createPrivateApiMockRequest({ role: "manager", workspace });
    const managerResponse = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?resourceTypes=agent&query=analyst`
    );
    expect(managerResponse.status).toBe(200);
    const managerBody: ResourceSearchResponse = await managerResponse.json();
    expect(managerBody.results.map((entry) => entry.resource.sId)).toContain(
      GLOBAL_AGENTS_SID.ANALYST
    );
  });

  it("enforces both resource ACLs and workspace isolation, with admin metadata redaction", async () => {
    const other = await createPrivateApiMockRequest({ role: "admin" });
    const foreign = await AgentConfigurationFactory.createTestAgent(
      other.auth,
      { name: "SharedAcl foreign" }
    );
    const foreignDocument =
      await AgentSearchDocumentResource.fetchSearchDocument(
        other.auth,
        foreign.sId
      );
    assert(foreignDocument);
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const space = await SpaceFactory.regular(workspace);
    const pod = await SpaceFactory.project(workspace);
    const readableSkill = await SkillFactory.create(auth, {
      name: "SharedAcl A skill",
    });
    const hiddenSkill = await SkillFactory.create(auth, {
      name: "SharedAcl B skill",
      requestedSpaceIds: [space.id, pod.id],
    });
    const readableAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "SharedAcl C agent" }
    );
    const hiddenAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "SharedAcl D agent",
      scope: "hidden",
      requestedSpaceIds: [pod.id],
    });
    const skills = await SkillSearchDocumentResource.fetchSearchDocuments(
      auth,
      [readableSkill.sId, hiddenSkill.sId]
    );
    const agents = await AgentSearchDocumentResource.fetchSearchDocuments(
      auth,
      [readableAgent.sId, hiddenAgent.sId]
    );
    serveDocuments(
      [...skills, ...agents, foreignDocument],
      "autocomplete",
      "SharedAcl"
    );
    const path = `/api/w/${workspace.sId}/search/resources?query=SharedAcl`;
    const strict = await honoApp.request(path);
    expect(strict.status).toBe(200);
    const strictBody: ResourceSearchResponse = await strict.json();
    expect(strictBody.results.map(({ resource }) => resource.sId)).toEqual([
      readableSkill.sId,
      readableAgent.sId,
    ]);

    const redacted = await honoApp.request(
      `${path}&permissionFiltering=redact_unreadable`
    );
    expect(redacted.status).toBe(200);
    const body: ResourceSearchResponse = await redacted.json();
    expect(
      body.results.map(({ resource }) => [resource.sId, resource.canRead])
    ).toEqual([
      [readableSkill.sId, true],
      [hiddenSkill.sId, false],
      [readableAgent.sId, true],
      [hiddenAgent.sId, false],
    ]);
    expect(JSON.stringify(body)).not.toContain("Test Instructions");
    expect(JSON.stringify(body)).not.toContain("Test skill instructions");
    const agentOnly = await honoApp.request(`${path}&resourceTypes=agent`);
    const agentOnlyBody: ResourceSearchResponse = await agentOnly.json();
    expect(
      agentOnlyBody.results.map(({ type, resource }) => [type, resource.sId])
    ).toEqual([["agent", readableAgent.sId]]);
    expect(mockOpenPit.mock.lastCall?.[0].index).toEqual(["front.agents"]);
    const request: estypes.SearchRequest = mockSearch.mock.lastCall![0];
    expect(request.sort).toEqual([
      { _score: { order: "desc" } },
      { "name.keyword": { order: "asc" } },
      { resource_id: { order: "asc" } },
    ]);
    expect(request.query?.bool?.filter).toEqual([
      { term: { workspace_id: workspace.sId } },
    ]);
  });

  it("rejects cursors reused with different resource types or permission modes", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    serveDocuments([]);
    const path = `/api/w/${workspace.sId}/search/resources?limit=1`;
    const first = await honoApp.request(path);
    const body: ResourceSearchResponse = await first.json();
    assert(body.nextCursor);
    for (const option of [
      "resourceTypes=agent",
      "permissionFiltering=redact_unreadable",
      "tagIds=tag",
      "mode=discovery",
    ]) {
      const response = await honoApp.request(
        `${path}&cursor=${body.nextCursor}&${option}`
      );
      expect(response.status).toBe(400);
    }
    expect(mockSearch).toHaveBeenCalledOnce();
  });

  it.each([
    "space",
    "pod",
    "editors",
  ] as const)("rechecks current %s access when replaying a redacted page over stale ES hits", async (access) => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const space =
      access === "space"
        ? await SpaceFactory.regular(workspace)
        : access === "pod"
          ? await SpaceFactory.project(workspace)
          : null;
    const anchor = await SkillFactory.create(auth, {
      name: "RedactionPage A",
      availability: "workspace_users",
    });
    const skill = await SkillFactory.create(auth, {
      name: "RedactionPage B",
      availability: access === "editors" ? "editors" : "workspace_users",
      requestedSpaceIds: space ? [space.id] : [],
      instructions: "Private redaction-page instructions",
    });
    const spaceGrant = space
      ? {
          users: [user.toJSON()],
          grantType: "reader" as const,
          resourceType: "space" as const,
          resourceId: space.id,
        }
      : null;
    if (spaceGrant) {
      expect(
        (await GroupPermissionResource.grantToUsers(auth, spaceGrant)).isOk()
      ).toBe(true);
    }
    await auth.refresh();
    const documents = await SkillSearchDocumentResource.fetchSearchDocuments(
      auth,
      [anchor.sId, skill.sId]
    );
    serveDocuments(documents, "autocomplete", "RedactionPage");
    const path = `/api/w/${workspace.sId}/search/resources?query=RedactionPage&resourceTypes=skill`;
    const first = await honoApp.request(
      `${path}&permissionFiltering=redact_unreadable&limit=1`
    );
    expect(first.status).toBe(200);
    const firstBody: ResourceSearchResponse = await first.json();
    expect(firstBody.results.map(({ resource }) => resource.sId)).toEqual([
      anchor.sId,
    ]);
    assert(firstBody.nextCursor);
    const nextPage = `${path}&permissionFiltering=redact_unreadable&limit=1&cursor=${firstBody.nextCursor}`;

    // Keep the PIT, ES documents and cursor unchanged across both permission transitions.
    for (const hasAccess of [false, true]) {
      const result = spaceGrant
        ? hasAccess
          ? await GroupPermissionResource.grantToUsers(auth, spaceGrant)
          : await GroupPermissionResource.revokeFromUsers(auth, spaceGrant)
        : hasAccess
          ? await skill.addEditors(auth, [user])
          : await skill.removeEditors(auth, [user]);
      expect(result.isOk()).toBe(true);

      const response = await honoApp.request(nextPage);
      expect(response.status).toBe(200);
      const body: ResourceSearchResponse = await response.json();
      expect(body.results).toEqual([
        expect.objectContaining({
          type: "skill",
          resource: expect.objectContaining({
            sId: skill.sId,
            // A workspace-wide reader grant still permits reading an editors-only skill;
            // strict search visibility is checked separately below.
            canRead: access === "editors" || hasAccess,
            canWrite: access !== "editors" || hasAccess,
            canAdministrate: true,
            fileAttachments: [],
          }),
        }),
      ]);
      expect(body.nextCursor).toBeNull();
      expect(body.results[0].resource).not.toHaveProperty("instructions");
      expect(body.results[0].resource).not.toHaveProperty("instructionsHtml");
      expect(body.results[0].resource).not.toHaveProperty("tools");
      if (!hasAccess) {
        const strict = await honoApp.request(path);
        expect(strict.status).toBe(200);
        const strictBody: ResourceSearchResponse = await strict.json();
        expect(strictBody.results.map(({ resource }) => resource.sId)).toEqual([
          anchor.sId,
        ]);
      }
    }
    // One PIT for redacted pagination, one for the independent strict search.
    expect(mockOpenPit).toHaveBeenCalledTimes(2);
  });

  it.each([
    undefined,
    { agentFacingDescription: "Incomplete indexed metadata" },
  ])("uses the existing canonical projection when listing metadata needs backfill: %j", async (metadata) => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth, {
      name: "LegacyMetadataFixture",
    });
    const document = await SkillSearchDocumentResource.fetchSearchDocument(
      auth,
      skill.sId
    );
    assert(document);
    mockSearch.mockResolvedValue({
      hits: {
        hits: [
          {
            _source: { ...document, metadata },
            sort: [100, document.name, document.skill_id, 0],
          },
        ],
      },
    });
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?query=LegacyMetadataFixture&resourceTypes=skill`
    );
    expect(response.status).toBe(200);
    const body: ResourceSearchResponse = await response.json();
    expect(body).toEqual({
      results: [
        {
          type: "skill",
          resource: skill.toSearchListingJSON(auth),
          score: 100,
        },
      ],
      nextCursor: null,
    });
  });

  it.each([
    "user",
    "builder",
    "manager",
  ] as const)("refuses redaction to %s before opening ES", async (role) => {
    const { workspace } = await createPrivateApiMockRequest({ role });
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?permissionFiltering=redact_unreadable`
    );
    expect(response.status).toBe(403);
    expect(mockOpenPit).not.toHaveBeenCalled();
  });

  it.each([
    "resourceTypes=other",
    "resourceTypes=",
    "tagIds=",
    "skillIds=",
    "permissionFiltering=dangerously_skip",
  ])("validates %s before searching", async (query) => {
    const { workspace } = await createPrivateApiMockRequest();
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/search/resources?${query}`
    );
    expect(response.status).toBe(400);
    expect(mockOpenPit).not.toHaveBeenCalled();
  });
});
