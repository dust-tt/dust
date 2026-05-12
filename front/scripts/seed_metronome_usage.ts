/**
 * Seed test usage events into Metronome so the pool bar in UsagePage shows
 * both the yellow (user) and purple (programmatic) segments.
 *
 * Usage:
 *   npx ts-node scripts/seed_metronome_usage.ts --execute
 *
 * What it does:
 *   - Ingests 200 AWU of programmatic usage → purple bar segment (~$2.00)
 *   - Ingests 100 AWU of user usage for a non-seat user → yellow bar segment (~$1.00)
 *   Events are timestamped to today so they fall within the active billing period
 *   and any active pool credit window.
 *
 * The dev workspace ingest alias is "DevWkSpace".
 */

import { ingestMetronomeEvents } from "@app/lib/metronome/client";
import type { MetronomeEvent } from "@app/lib/metronome/types";
import { v4 as uuidv4 } from "uuid";

import { makeScript } from "./helpers";

const DEV_WORKSPACE_SID = "DevWkSpace";

async function seedMetronomeUsage(execute: boolean): Promise<void> {
  const now = new Date().toISOString();

  const events: MetronomeEvent[] = [
    // 200 AWU of programmatic usage
    {
      transaction_id: uuidv4(),
      customer_id: DEV_WORKSPACE_SID,
      event_type: "llm_usage_v3",
      timestamp: now,
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
      customer_id: DEV_WORKSPACE_SID,
      event_type: "llm_usage_v3",
      timestamp: now,
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
      `[dry-run] Would ingest ${events.length} events:`,
      JSON.stringify(events, null, 2)
    );
    return;
  }

  await ingestMetronomeEvents(events);
  console.log(
    `Ingested ${events.length} events: 200 AWU programmatic + 100 AWU user`
  );
}

makeScript({}, async (_args, _logger) => {
  await seedMetronomeUsage(_args.execute);
});
