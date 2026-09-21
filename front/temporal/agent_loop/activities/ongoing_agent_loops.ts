import type { OngoingAgentLoopRegistryEntry } from "@app/lib/api/assistant/ongoing_agent_loops";
import {
  deleteOngoingAgentLoop,
  upsertOngoingAgentLoop,
} from "@app/lib/api/assistant/ongoing_agent_loops";

export async function upsertOngoingAgentLoopActivity(
  entry: OngoingAgentLoopRegistryEntry
): Promise<void> {
  await upsertOngoingAgentLoop(entry);
}

export async function deleteOngoingAgentLoopActivity(
  entry: OngoingAgentLoopRegistryEntry
): Promise<void> {
  await deleteOngoingAgentLoop(entry);
}
