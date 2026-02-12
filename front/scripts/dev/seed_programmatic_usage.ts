import { ANALYTICS_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { AgentMessageAnalyticsData } from "@app/types/assistant/analytics";

const MICRO_USD_PER_DOLLAR = 1_000_000;
const TOKEN_PROMPT_RANGE = { min: 100, max: 5000 };
const TOKEN_COMPLETION_RANGE = { min: 50, max: 2000 };
const TOKEN_CACHED_RANGE = { min: 0, max: 500 };
const COST_MICRO_USD_RANGE = { min: 1_000_000, max: 10_000_000 };
const LATENCY_MS_RANGE = { min: 100, max: 2000 };
const AGENT_COUNT = 5;
const API_KEY_COUNT = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBack: number): Date {
  const now = Date.now();
  const pastMs = daysBack * MS_PER_DAY;
  const randomOffset = Math.random() * pastMs;
  return new Date(now - randomOffset);
}

function makeDocumentId(
  workspaceId: string,
  messageId: string,
  version: string
): string {
  return `${workspaceId}_${messageId}_${version}`;
}

async function seedProgrammaticUsage(
  {
    wId,
    creditAmountDollars,
    usageCount,
    daysBack,
  }: {
    wId: string;
    creditAmountDollars: number;
    usageCount: number;
    daysBack: number;
  },
  execute: boolean,
  logger: Logger
) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "DEV ONLY - This script seeds fake usage data and must NOT be run in production."
    );
  }

  logger.info(
    {
      wId,
      creditAmountDollars,
      usageCount,
      daysBack,
      execute,
    },
    "Configuration"
  );

  const workspace = await WorkspaceResource.fetchById(wId);
  if (!workspace) {
    throw new Error(`Workspace not found with sId: ${wId}`);
  }

  logger.info(
    { workspaceName: workspace.name, workspaceId: workspace.id },
    "Found workspace"
  );

  const auth = await Authenticator.internalBuilderForWorkspace(wId);

  const usageEntries: Array<{
    document: AgentMessageAnalyticsData;
    documentId: string;
  }> = [];
  let totalCostMicroUsd = 0;

  for (let i = 0; i < usageCount; i++) {
    const timestamp = randomDate(daysBack);
    const costMicroUsd = randomInt(
      COST_MICRO_USD_RANGE.min,
      COST_MICRO_USD_RANGE.max
    );
    totalCostMicroUsd += costMicroUsd;

    const messageId = `seed-msg-${Date.now()}-${i}`;
    const version = "1";

    const document: AgentMessageAnalyticsData = {
      agent_id: `seed-agent-${i % AGENT_COUNT}`,
      agent_version: "1",
      conversation_id: `seed-conv-${i}`,
      context_origin: "api",
      latency_ms: randomInt(LATENCY_MS_RANGE.min, LATENCY_MS_RANGE.max),
      message_id: messageId,
      skills_used: [],
      status: "succeeded",
      timestamp: timestamp.toISOString(),
      tokens: {
        prompt: randomInt(TOKEN_PROMPT_RANGE.min, TOKEN_PROMPT_RANGE.max),
        completion: randomInt(
          TOKEN_COMPLETION_RANGE.min,
          TOKEN_COMPLETION_RANGE.max
        ),
        reasoning: 0,
        cached: randomInt(TOKEN_CACHED_RANGE.min, TOKEN_CACHED_RANGE.max),
        cost_micro_usd: costMicroUsd,
      },
      tools_used: [],
      feedbacks: [],
      user_id: "seed-user",
      workspace_id: wId,
      version,
      auth_method: "api_key",
      api_key_name: `seed-api-key-${i % API_KEY_COUNT}`,
    };

    const documentId = makeDocumentId(wId, messageId, version);
    usageEntries.push({ document, documentId });
  }

  logger.info(
    {
      usageCount,
      totalCostMicroUsd,
      totalCostDollars: totalCostMicroUsd / MICRO_USD_PER_DOLLAR,
    },
    "Generated usage entries"
  );

  if (!execute) {
    logger.info(
      { sampleDocument: usageEntries[0]?.document },
      "Dry run mode - not making any changes"
    );
    return;
  }

  const initialAmountMicroUsd = creditAmountDollars * MICRO_USD_PER_DOLLAR;
  logger.info(
    { initialAmountMicroUsd, creditAmountDollars },
    "Creating free credit"
  );

  const credit = await CreditResource.makeNew(auth, {
    type: "free",
    initialAmountMicroUsd,
    consumedAmountMicroUsd: 0,
  });

  logger.info({ creditId: credit.id }, "Created credit");

  const startResult = await credit.start(auth);
  if (startResult.isErr()) {
    throw new Error(`Error starting credit: ${startResult.error.message}`);
  }
  logger.info("Credit started successfully");

  logger.info("Indexing documents to Elasticsearch...");
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  const esResult = await withEs(async (client) => {
    const bulkBody = usageEntries.flatMap(({ document, documentId }) => [
      { index: { _index: ANALYTICS_ALIAS_NAME, _id: documentId } },
      document,
    ]);

    return client.bulk({ body: bulkBody });
  });

  if (esResult.isErr()) {
    throw new Error(
      `Error indexing to Elasticsearch: ${esResult.error.message}`
    );
  }

  logger.info({ usageCount }, "Indexed documents to Elasticsearch");

  logger.info({ totalCostMicroUsd }, "Consuming credit");
  const consumeResult = await credit.consume({
    amountInMicroUsd: totalCostMicroUsd,
  });
  if (consumeResult.isErr()) {
    throw new Error(`Error consuming credit: ${consumeResult.error.message}`);
  }

  const remainingMicroUsd = initialAmountMicroUsd - totalCostMicroUsd;

  logger.info(
    {
      creditAmountDollars,
      usageCount,
      totalConsumedDollars: totalCostMicroUsd / MICRO_USD_PER_DOLLAR,
      remainingDollars: remainingMicroUsd / MICRO_USD_PER_DOLLAR,
    },
    "Summary"
  );

  logger.info(
    {
      checkCreditsQuery: `SELECT * FROM credits WHERE "workspaceId" = ${workspace.id} ORDER BY "createdAt" DESC LIMIT 5;`,
      checkEsCommand: `curl -X GET "localhost:9200/${ANALYTICS_ALIAS_NAME}/_search?q=workspace_id:${wId}&size=10"`,
      viewPage: `/w/${wId}/developers/credits-usage`,
    },
    "Verification"
  );
}

makeScript(
  {
    wId: {
      type: "string",
      description: "Workspace sId",
      demandOption: true,
    },
    creditAmountDollars: {
      type: "number",
      description: "Amount of credits to create in dollars",
      default: 5000,
    },
    usageCount: {
      type: "number",
      description: "Number of usage entries to create",
      default: 1000,
    },
    daysBack: {
      type: "number",
      description: "Number of days back to spread usage entries",
      default: 90,
    },
  },
  async ({ wId, creditAmountDollars, usageCount, daysBack, execute }, logger) =>
    seedProgrammaticUsage(
      { wId, creditAmountDollars, usageCount, daysBack },
      execute,
      logger
    )
);
