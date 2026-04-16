import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { isModelId } from "@app/types/assistant/models/models";
import type { ModelIdType } from "@app/types/assistant/models/types";

export const RUN_DEDUP_EVAL = process.env.RUN_DEDUP_EVAL === "true";
export const JUDGE_RUNS = parseInt(process.env.JUDGE_RUNS ?? "3", 10);
export const PASS_THRESHOLD = parseInt(process.env.PASS_THRESHOLD ?? "2", 10);
export const FILTER_SCENARIO = process.env.FILTER_SCENARIO;
export const VERBOSE = process.env.VERBOSE === "true";

/** Model used for the deduplication LLM calls. */
function resolveModelId(): ModelIdType {
  const id =
    process.env.DEDUP_MODEL_ID || CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG.modelId;
  if (!isModelId(id)) {
    throw new Error(
      `Invalid DEDUP_MODEL_ID: "${id}". Must be a known model ID.`
    );
  }
  return id;
}

export const MODEL_ID = resolveModelId();

export const TIMEOUT_MS = 300_000;

export async function getDedupEvalAuth(): Promise<Authenticator> {
  const workspace = await WorkspaceFactory.basic();
  return Authenticator.internalAdminForWorkspace(workspace.sId);
}
