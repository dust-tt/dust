import { getRedisCacheClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import {
  AGENT_STEP_CONTENT_CACHE_TTL_MS,
  agentStepContentCacheKey,
  agentStepContentHashField,
} from "@app/lib/resources/agent_step_content/cache";
import {
  AgentStepContentResource,
  FETCH_BY_AGENT_MESSAGES_CHUNK_SIZE,
} from "@app/lib/resources/agent_step_content_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentTextContentType } from "@app/types/assistant/agent_message_content";
import { beforeEach, describe, expect, it, vi } from "vitest";

function makeTextContent(value: string): AgentTextContentType {
  return {
    type: "text_content",
    value,
  };
}

async function createAgentMessages(
  auth: Authenticator,
  {
    count,
    agentConfigurationId,
    agentConfigurationVersion,
  }: {
    count: number;
    agentConfigurationId: string;
    agentConfigurationVersion: number;
  }
): Promise<AgentMessageModel[]> {
  const workspace = auth.getNonNullableWorkspace();

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId,
    messagesCreatedAt: [],
  });

  return AgentMessageModel.bulkCreate(
    Array.from({ length: count }, () => ({
      conversationId: conversation.id,
      workspaceId: workspace.id,
      status: "succeeded",
      agentConfigurationId,
      agentConfigurationVersion,
      skipToolsValidation: true,
      completedAt: new Date(),
    })),
    { returning: true }
  );
}

describe("AgentStepContentResource.fetchByAgentMessages", () => {
  it("fetches only the requested step", async () => {
    const { authenticator, workspace } = await createResourceTest({});
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Single Step Fetch Agent" }
    );
    const [agentMessage] = await createAgentMessages(authenticator, {
      count: 1,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });
    await AgentStepContentModel.bulkCreate(
      [0, 1].map((step) => ({
        workspaceId: workspace.id,
        agentMessageId: agentMessage.id,
        step,
        index: 0,
        version: 0,
        type: "text_content" as const,
        value: makeTextContent(`step-${step}`),
      }))
    );

    const stepContents =
      await AgentStepContentResource.fetchByAgentMessageModelIdsAtStep(
        authenticator,
        {
          agentMessageModelIds: [agentMessage.id],
          step: 1,
        }
      );

    expect(stepContents.map(({ step }) => step)).toEqual([1]);
    expect(stepContents[0].value).toEqual(makeTextContent("step-1"));
  });

  it("returns latest versions for every agent message when the input exceeds the chunk size", async () => {
    const { authenticator, workspace } = await createResourceTest({});
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Chunk Fetch Test Agent",
      }
    );
    const agentMessages = await createAgentMessages(authenticator, {
      count: FETCH_BY_AGENT_MESSAGES_CHUNK_SIZE + 1,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });

    const [versionedAgentMessage, ...remainingAgentMessages] = agentMessages;

    await AgentStepContentModel.bulkCreate([
      {
        workspaceId: workspace.id,
        agentMessageId: versionedAgentMessage.id,
        step: 0,
        index: 0,
        version: 0,
        type: "text_content",
        value: makeTextContent("old version"),
      },
      {
        workspaceId: workspace.id,
        agentMessageId: versionedAgentMessage.id,
        step: 0,
        index: 0,
        version: 1,
        type: "text_content",
        value: makeTextContent("new version"),
      },
      ...remainingAgentMessages.map((agentMessage, index) => ({
        workspaceId: workspace.id,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 0,
        version: 0,
        type: "text_content" as const,
        value: makeTextContent(`message-${index}`),
      })),
    ]);

    const stepContents = await AgentStepContentResource.fetchByAgentMessages(
      authenticator,
      {
        agentMessageIds: agentMessages.map((message) => message.id),
      }
    );

    expect(stepContents).toHaveLength(agentMessages.length);
    expect(
      stepContents.map((c) => c.agentMessageId).toSorted((a, b) => a - b)
    ).toEqual(agentMessages.map((m) => m.id).toSorted((a, b) => a - b));

    const latestVersion = stepContents.find(
      (content) => content.agentMessageId === versionedAgentMessage.id
    );
    expect(latestVersion?.version).toBe(1);
    expect(latestVersion?.value).toEqual(makeTextContent("new version"));
  });
});

describe("AgentStepContentResource Redis cache", () => {
  let authenticator: Authenticator;
  let workspaceId: number;
  let agentMessage: AgentMessageModel;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    authenticator = setup.authenticator;
    workspaceId = setup.workspace.id;

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Step Content Cache Agent",
      }
    );
    const [message] = await createAgentMessages(authenticator, {
      count: 1,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });
    agentMessage = message;
  });

  it("warms Redis on createNewVersion and serves fetchByAgentMessages from cache", async () => {
    const created = await AgentStepContentResource.createNewVersion({
      workspaceId,
      agentMessageId: agentMessage.id,
      step: 0,
      index: 0,
      type: "text_content",
      value: makeTextContent("from create"),
    });

    const redis = await getRedisCacheClient({
      origin: "agent_step_content_cache",
    });
    const key = agentStepContentCacheKey({
      workspaceId,
      agentMessageId: agentMessage.id,
    });
    const field = agentStepContentHashField({ step: 0, index: 0 });

    // Inspect the hash written by createNewVersion.
    const hash = await redis.hGetAll(key);
    expect(hash[field]).toBeDefined();
    expect(JSON.parse(hash[field]).id).toBe(created.id);
    expect(JSON.parse(hash[field]).value).toEqual(
      makeTextContent("from create")
    );

    // Spy on full-row PG fetch: cache hit should skip loading `value` from PG.
    const findAllSpy = vi.spyOn(AgentStepContentModel, "findAll");

    const fetched = await AgentStepContentResource.fetchByAgentMessages(
      authenticator,
      { agentMessageIds: [agentMessage.id] }
    );

    expect(fetched).toHaveLength(1);
    expect(fetched[0].id).toBe(created.id);
    expect(fetched[0].value).toEqual(makeTextContent("from create"));

    // Metadata query excludes `value`; no subsequent full-row findAll.
    const findAllCalls = findAllSpy.mock.calls;
    expect(findAllCalls.length).toBeGreaterThanOrEqual(1);
    for (const [options] of findAllCalls) {
      const attrs = options?.attributes;
      expect(attrs).toBeDefined();
      if (Array.isArray(attrs)) {
        expect(attrs).not.toContain("value");
      }
    }

    findAllSpy.mockRestore();
  });

  it("falls back to Postgres when the Redis hash is incomplete", async () => {
    const created = await AgentStepContentResource.createNewVersion({
      workspaceId,
      agentMessageId: agentMessage.id,
      step: 0,
      index: 0,
      type: "text_content",
      value: makeTextContent("cached"),
    });

    // Second row inserted without warming Redis (bulkCreate bypasses createNewVersion).
    await AgentStepContentModel.create({
      workspaceId,
      agentMessageId: agentMessage.id,
      step: 0,
      index: 1,
      version: 0,
      type: "text_content",
      value: makeTextContent("only in pg"),
    });

    const fetched = await AgentStepContentResource.fetchByAgentMessages(
      authenticator,
      { agentMessageIds: [agentMessage.id] }
    );

    expect(fetched).toHaveLength(2);
    expect(
      fetched.map((c) => (c.value as AgentTextContentType).value).toSorted()
    ).toEqual(["cached", "only in pg"]);
    expect(fetched.map((c) => c.id).includes(created.id)).toBe(true);
  });

  it("falls back to Postgres when a backfill changes dustRunId behind the cache", async () => {
    const created = await AgentStepContentResource.createNewVersion({
      workspaceId,
      agentMessageId: agentMessage.id,
      step: 0,
      index: 0,
      type: "text_content",
      value: makeTextContent("cached before backfill"),
    });

    await AgentStepContentModel.update(
      { dustRunId: "backfilled-run-id" },
      {
        where: { id: created.id, workspaceId },
        fields: ["dustRunId"],
        silent: true,
      }
    );

    const fetched = await AgentStepContentResource.fetchByAgentMessages(
      authenticator,
      { agentMessageIds: [agentMessage.id] }
    );

    expect(fetched).toHaveLength(1);
    expect(fetched[0].dustRunId).toBe("backfilled-run-id");
  });

  it("overwrites the hash field when creating a new version of the same step/index", async () => {
    await AgentStepContentResource.createNewVersion({
      workspaceId,
      agentMessageId: agentMessage.id,
      step: 0,
      index: 0,
      type: "text_content",
      value: makeTextContent("v0"),
    });

    const v1 = await AgentStepContentResource.createNewVersion({
      workspaceId,
      agentMessageId: agentMessage.id,
      step: 0,
      index: 0,
      type: "text_content",
      value: makeTextContent("v1"),
    });

    const fetched = await AgentStepContentResource.fetchByAgentMessages(
      authenticator,
      { agentMessageIds: [agentMessage.id] }
    );

    expect(fetched).toHaveLength(1);
    expect(fetched[0].id).toBe(v1.id);
    expect(fetched[0].version).toBe(1);
    expect(fetched[0].value).toEqual(makeTextContent("v1"));
  });

  it("refreshes TTL on warm", async () => {
    await AgentStepContentResource.createNewVersion({
      workspaceId,
      agentMessageId: agentMessage.id,
      step: 0,
      index: 0,
      type: "text_content",
      value: makeTextContent("ttl"),
    });

    const redis = await getRedisCacheClient({
      origin: "agent_step_content_cache",
    });
    // multi().pExpire is invoked during warm; assert the mock was used with the TTL.
    expect(redis.pExpire).toHaveBeenCalledWith(
      agentStepContentCacheKey({
        workspaceId,
        agentMessageId: agentMessage.id,
      }),
      AGENT_STEP_CONTENT_CACHE_TTL_MS
    );
  });
});

describe("AgentStepContentResource.createNewVersions", () => {
  let authenticator: Authenticator;
  let workspaceId: number;
  let agentMessage: AgentMessageModel;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    authenticator = setup.authenticator;
    workspaceId = setup.workspace.id;

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Step Content Bulk Create Agent",
      }
    );
    const [message] = await createAgentMessages(authenticator, {
      count: 1,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });
    agentMessage = message;
  });

  it("inserts multiple contents in one roundtrip with version 0", async () => {
    const created = await AgentStepContentResource.createNewVersions([
      {
        workspaceId,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 0,
        type: "text_content",
        value: makeTextContent("first"),
      },
      {
        workspaceId,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 1,
        type: "text_content",
        value: makeTextContent("second"),
      },
    ]);

    expect(created).toHaveLength(2);
    expect(created.map((c) => c.index)).toEqual([0, 1]);
    expect(created.map((c) => c.version)).toEqual([0, 0]);
    expect(created.map((c) => (c.value as AgentTextContentType).value)).toEqual(
      ["first", "second"]
    );

    const fetched = await AgentStepContentResource.fetchByAgentMessages(
      authenticator,
      { agentMessageIds: [agentMessage.id] }
    );
    expect(fetched).toHaveLength(2);
  });

  it("bumps versions when re-inserting the same step/index pairs", async () => {
    await AgentStepContentResource.createNewVersions([
      {
        workspaceId,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 0,
        type: "text_content",
        value: makeTextContent("v0-a"),
      },
      {
        workspaceId,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 1,
        type: "text_content",
        value: makeTextContent("v0-b"),
      },
    ]);

    const created = await AgentStepContentResource.createNewVersions([
      {
        workspaceId,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 0,
        type: "text_content",
        value: makeTextContent("v1-a"),
      },
      {
        workspaceId,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 1,
        type: "text_content",
        value: makeTextContent("v1-b"),
      },
    ]);

    expect(created.map((c) => c.version)).toEqual([1, 1]);

    const fetched = await AgentStepContentResource.fetchByAgentMessages(
      authenticator,
      { agentMessageIds: [agentMessage.id] }
    );
    expect(fetched).toHaveLength(2);
    expect(
      fetched
        .toSorted((a, b) => a.index - b.index)
        .map((c) => (c.value as AgentTextContentType).value)
    ).toEqual(["v1-a", "v1-b"]);
  });

  it("warms Redis for all inserted contents", async () => {
    const created = await AgentStepContentResource.createNewVersions([
      {
        workspaceId,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 0,
        type: "text_content",
        value: makeTextContent("cached-0"),
      },
      {
        workspaceId,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 1,
        type: "text_content",
        value: makeTextContent("cached-1"),
      },
    ]);

    const redis = await getRedisCacheClient({
      origin: "agent_step_content_cache",
    });
    const key = agentStepContentCacheKey({
      workspaceId,
      agentMessageId: agentMessage.id,
    });
    const hash = await redis.hGetAll(key);

    expect(
      JSON.parse(hash[agentStepContentHashField({ step: 0, index: 0 })]).id
    ).toBe(created[0].id);
    expect(
      JSON.parse(hash[agentStepContentHashField({ step: 0, index: 1 })]).id
    ).toBe(created[1].id);
  });

  it("returns an empty array for an empty input", async () => {
    const created = await AgentStepContentResource.createNewVersions([]);
    expect(created).toEqual([]);
  });

  it("persists dustRunId (null when omitted) through the cache and Postgres", async () => {
    const created = await AgentStepContentResource.createNewVersions([
      {
        workspaceId,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 0,
        type: "text_content",
        value: makeTextContent("emitted by a run"),
        dustRunId: "dust_run_abc",
      },
      {
        workspaceId,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 1,
        type: "text_content",
        value: makeTextContent("no run"),
        // dustRunId omitted -> stored as null.
      },
    ]);

    expect(
      created.toSorted((a, b) => a.index - b.index).map((c) => c.dustRunId)
    ).toEqual(["dust_run_abc", null]);

    // Cache path: createNewVersions warms Redis, so this fetch is served from it.
    const fromCache = await AgentStepContentResource.fetchByAgentMessages(
      authenticator,
      { agentMessageIds: [agentMessage.id] }
    );
    expect(
      fromCache.toSorted((a, b) => a.index - b.index).map((c) => c.dustRunId)
    ).toEqual(["dust_run_abc", null]);

    // Postgres path: bust the cache so the next fetch reads the persisted rows.
    const redis = await getRedisCacheClient({
      origin: "agent_step_content_cache",
    });
    await redis.del(
      agentStepContentCacheKey({ workspaceId, agentMessageId: agentMessage.id })
    );

    const fromPostgres = await AgentStepContentResource.fetchByAgentMessages(
      authenticator,
      { agentMessageIds: [agentMessage.id] }
    );
    expect(
      fromPostgres.toSorted((a, b) => a.index - b.index).map((c) => c.dustRunId)
    ).toEqual(["dust_run_abc", null]);
  });
});
