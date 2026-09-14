import type { AgentExportRow } from "@app/lib/api/analytics/agents_export";
import {
  AGENT_EXPORT_HEADERS,
  fetchAgentExportRows,
  toAgentExportCsvRow,
} from "@app/lib/api/analytics/agents_export";
import { rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep `bucketsToArray` (and everything else) real; only stub the Elasticsearch
// query so the test does not depend on a live cluster.
vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchConsumptionAnalytics: vi.fn() };
});

// The export reads from the read replica; in tests there is no replica so point
// it at the primary test connection.
vi.mock("@app/lib/resources/storage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/resources/storage")>();
  return {
    ...actual,
    getFrontReplicaDbConnection: () => actual.frontSequelize,
  };
});

function mockEmptyEsMetrics() {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
      aggregations: {
        by_agent: { buckets: [] },
      },
    })
  );
}

describe("fetchAgentExportRows", () => {
  beforeEach(() => {
    mockEmptyEsMetrics();
  });

  it("returns every editor across all versions in editorEmails and the active-version author in authorEmails", async () => {
    const {
      authenticator: authorAAuth,
      workspace,
      user: authorA,
    } = await createResourceTest({ role: "admin" });

    // A second member who will edit (create a new version of) the agent.
    const authorB = await UserFactory.basic();
    await MembershipFactory.associate(workspace, authorB, { role: "admin" });
    const authorBAuth = await Authenticator.fromUserIdAndWorkspaceId(
      authorB.sId,
      workspace.sId
    );

    // Version 0 authored by A, version 1 (an edit) authored by B.
    const agent = await AgentConfigurationFactory.createTestAgent(authorAAuth, {
      name: "Multi-author agent",
    });

    const editorGroupResult = await GroupResource.findEditorGroupForAgent(
      authorAAuth,
      agent
    );
    expect(editorGroupResult.isOk()).toBe(true);
    if (editorGroupResult.isErr()) {
      throw editorGroupResult.error;
    }
    const addAuthorBResult =
      await editorGroupResult.value.dangerouslyAddMembers(authorAAuth, {
        users: [authorB.toJSON()],
      });
    expect(addAuthorBResult.isOk()).toBe(true);
    if (addAuthorBResult.isErr()) {
      throw addAuthorBResult.error;
    }
    await authorBAuth.refresh();

    await AgentConfigurationFactory.updateTestAgent(authorBAuth, agent.sId);

    const result = await fetchAgentExportRows(
      {},
      authorAAuth,
      /* includeHiddenAgents */ false
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    const row = result.value.find((r) => r.agentId === agent.sId);
    expect(row).toBeDefined();

    // editorEmails lists everyone who authored any version (A and B).
    expect(row!.editorEmails).toHaveLength(2);
    expect(new Set(row!.editorEmails)).toEqual(
      new Set([authorA.email, authorB.email])
    );

    // authorEmails keeps its original behavior: the author of the active
    // (latest) version, which is B after B's edit.
    expect(row!.authorEmails).toBe(authorB.email);
  });

  it("returns the single author for an agent with a single version", async () => {
    const { authenticator, user } = await createResourceTest({
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Single-author agent" }
    );

    const result = await fetchAgentExportRows(
      {},
      authenticator,
      /* includeHiddenAgents */ false
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    const row = result.value.find((r) => r.agentId === agent.sId);
    expect(row).toBeDefined();
    expect(row!.authorEmails).toBe(user.email);
    expect(row!.editorEmails).toEqual([user.email]);
  });
});

describe("toAgentExportCsvRow", () => {
  const baseRow: AgentExportRow = {
    agentId: "a1",
    name: "Agent",
    description: "",
    settings: "published",
    modelId: "gpt-4-turbo",
    providerId: "openai",
    authorEmails: "b@dust.tt",
    editorEmails: ["a@dust.tt", "b@dust.tt"],
    messages: 0,
    distinctUsersReached: 0,
    distinctConversations: 0,
    lastEdit: "",
    credits: 0,
  };

  it("joins editorEmails into a comma-separated string for CSV output", () => {
    expect(toAgentExportCsvRow(baseRow).editorEmails).toBe(
      "a@dust.tt,b@dust.tt"
    );
  });

  it("renders an empty editors list as an empty string", () => {
    expect(
      toAgentExportCsvRow({ ...baseRow, editorEmails: [] }).editorEmails
    ).toBe("");
  });

  it("wraps the comma-separated editors in double quotes once serialized", () => {
    const csv = rowsToCsv(AGENT_EXPORT_HEADERS, [toAgentExportCsvRow(baseRow)]);
    expect(csv).toContain('"a@dust.tt,b@dust.tt"');
  });
});
