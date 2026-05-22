import { getLargeWhitelistedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

// TODO: remove the vertex exclusion when vertex supports batch mode
export async function getLargeWhitelistedModelWithBatchMode(
  auth: Authenticator
): Promise<ModelConfigurationType | null> {
  const useVertex = await hasFeatureFlag(
    auth,
    "use_vertex_for_anthropic_models"
  );
  const excludedProviders = useVertex
    ? new Set<"anthropic">(["anthropic"])
    : new Set<never>();

  return getLargeWhitelistedModel(auth, excludedProviders, { forBatch: true });
}
