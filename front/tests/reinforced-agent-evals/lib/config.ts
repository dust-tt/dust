import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { isModelId } from "@app/types/assistant/models/models";
import type { ModelIdType } from "@app/types/assistant/models/types";

export const RUN_REINFORCED_EVAL = process.env.RUN_REINFORCED_EVAL === "true";
export const USE_BATCH = process.env.USE_BATCH === "true";
export const JUDGE_RUNS = parseInt(process.env.JUDGE_RUNS ?? "3", 10);
export const PASS_THRESHOLD = parseInt(process.env.PASS_THRESHOLD ?? "2", 10);
export const FILTER_CATEGORY = process.env.FILTER_CATEGORY;
export const FILTER_SCENARIO = process.env.FILTER_SCENARIO;
export const VERBOSE = process.env.VERBOSE === "true";

/** Model used for the reinforced agent LLM calls. */
function resolveModelId(): ModelIdType {
  const id = process.env.REINFORCED_MODEL_ID || "claude-sonnet-4-6";
  if (!isModelId(id)) {
    throw new Error(
      `Invalid REINFORCED_MODEL_ID: "${id}". Must be a known model ID.`
    );
  }
  return id;
}

export const MODEL_ID = resolveModelId();

export const TIMEOUT_MS = 300_000;
export const BATCH_TIMEOUT_MS = 1_800_000; // 30 minutes for batch polling
export const BATCH_POLL_INTERVAL_MS = 10_000;

export async function getReinforcedEvalAuth(): Promise<Authenticator> {
  const workspace = await WorkspaceFactory.basic();
  return Authenticator.internalAdminForWorkspace(workspace.sId);
}
