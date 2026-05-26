import { getLargeWhitelistedModel } from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export async function getLargeWhitelistedModelWithBatchMode(
  auth: Authenticator
): Promise<ModelConfigurationType | null> {
  return getLargeWhitelistedModel(auth, new Set(), { forBatch: true });
}
