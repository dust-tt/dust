/**
 * Seed a realistic credit pool and test usage events into Metronome for the
 * local Usage page.
 *
 * Usage:
 *   npx tsx scripts/seed_metronome_usage.ts --execute
 *
 * What it does:
 *   - Grants a 60,100,000 AWU credit pool for the current calendar month
 *   - Ingests 200 AWU of programmatic usage
 *   - Ingests 100 AWU of user usage for a non-seat user
 *   Events are timestamped to today so they fall within the active billing period
 *   and any active pool credit window.
 *
 * The dev workspace sId is "DevWkSpace"; the ingest alias sent to Metronome
 * is derived from it via `getMetronomeIngestAlias` (scoped per dust-hive
 * environment when running under dust-hive).
 */

import {
  createMetronomeCredit,
  getMetronomeIngestAlias,
  ingestMetronomeEvents,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_PURCHASED_COMMIT,
  CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  CONTRACT_CREDIT_TYPE_POOL,
  getCreditTypeAwuId,
  getProductFreeCreditId,
} from "@app/lib/metronome/constants";
import type { MetronomeEvent } from "@app/lib/metronome/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { v4 as uuidv4 } from "uuid";

import { makeScript } from "./helpers";

const DEV_WORKSPACE_SID = "DevWkSpace";
const SEEDED_POOL_CREDITS = 60_100_000;

async function seedMetronomeUsage(execute: boolean): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const customerId = getMetronomeIngestAlias(DEV_WORKSPACE_SID);
  const poolStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const poolEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );

  const events: MetronomeEvent[] = [
    // 200 AWU of programmatic usage
    {
      transaction_id: uuidv4(),
      customer_id: customerId,
      event_type: "llm_usage_v3",
      timestamp: nowIso,
      properties: {
        cost_awu: 200,
        is_programmatic_usage: "true",
        is_free_usage: "false",
        user_id: "unknown",
        api_key_name: "seed-script",
        model_id: "claude-3-5-sonnet-20241022",
        origin: "api",
        agent_id: "seed-agent",
        workspace_id: DEV_WORKSPACE_SID,
      },
    },
    // 100 AWU of user usage for a synthetic non-seat user
    {
      transaction_id: uuidv4(),
      customer_id: customerId,
      event_type: "llm_usage_v3",
      timestamp: nowIso,
      properties: {
        cost_awu: 100,
        is_programmatic_usage: "false",
        is_free_usage: "false",
        user_id: "seed-pool-user",
        api_key_name: "unknown",
        model_id: "claude-3-5-sonnet-20241022",
        origin: "chat",
        agent_id: "seed-agent",
        workspace_id: DEV_WORKSPACE_SID,
      },
    },
  ];

  if (!execute) {
    console.log(
      `[dry-run] Would grant ${SEEDED_POOL_CREDITS.toLocaleString()} pool credits from ${poolStart.toISOString()} to ${poolEnd.toISOString()} and ingest ${events.length} events:`,
      JSON.stringify(events, null, 2)
    );
    return;
  }

  const workspace = await WorkspaceResource.fetchById(DEV_WORKSPACE_SID);
  if (!workspace?.metronomeCustomerId) {
    throw new Error(
      `Workspace ${DEV_WORKSPACE_SID} is not provisioned in Metronome.`
    );
  }

  const poolResult = await createMetronomeCredit({
    metronomeCustomerId: workspace.metronomeCustomerId,
    productId: getProductFreeCreditId(),
    creditTypeId: getCreditTypeAwuId(),
    amount: SEEDED_POOL_CREDITS,
    startingAt: poolStart.toISOString(),
    endingBefore: poolEnd.toISOString(),
    name: "Local Usage page credit pool",
    idempotencyKey: `seed-usage-credit-pool-${DEV_WORKSPACE_SID}-${poolStart.toISOString()}`,
    priority: AWU_PRIORITY_PURCHASED_COMMIT,
    applicableProductTags: ["usage"],
    customFields: {
      [CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY]: CONTRACT_CREDIT_TYPE_POOL,
    },
  });
  if (poolResult.isErr()) {
    throw poolResult.error;
  }

  await ingestMetronomeEvents(events);
  console.log(
    `Granted ${SEEDED_POOL_CREDITS.toLocaleString()} pool credits and ingested ${events.length} events: 200 AWU programmatic + 100 AWU user`
  );
}

makeScript({}, async (_args, _logger) => {
  await seedMetronomeUsage(_args.execute);
});
