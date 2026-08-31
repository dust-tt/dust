import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// How long a pod may serve a stale set of degraded models.
const REFRESH_INTERVAL_MS = 60 * 1000;

let cachedDegradedModelIds: ReadonlySet<string> = new Set();
let lastRefreshStartedAtMs = 0;
let refreshing = false;

/**
 * The models an operator marked as degraded, i.e. having an ongoing incident on
 * the provider side.
 *
 * Only the stream resolution flow reads this: an `auto` stream skips a degraded
 * candidate and moves to the next one in its pool. A definitive pick -- an
 * agent configured on a concrete model, or a user overriding the model from the
 * picker -- runs as usual, degraded or not, because we must never answer as a
 * model other than the one that was explicitly asked for.
 *
 * TODO(detect_outage): degradation is stored per endpoint (model + provider +
 * host) but collapsed to model ids here, so a model is reported degraded as
 * soon as one of its endpoints is. That is the conservative reading. Once the
 * router filters degraded endpoints itself, a model served from another healthy
 * host should stay in the streams and only the degraded endpoint be skipped.
 */
export function getDegradedModelIds(): ReadonlySet<string> {
  const now = Date.now();
  if (!refreshing && now - lastRefreshStartedAtMs > REFRESH_INTERVAL_MS) {
    refreshing = true;
    lastRefreshStartedAtMs = now;

    void ModelDegradationResource.listDegradedEndpoints()
      .then((degradedEndpoints) => {
        cachedDegradedModelIds = new Set(
          degradedEndpoints.map((endpoint) => endpoint.modelId)
        );
      })
      .catch((err) => {
        // Keep the last known set: a database blip must not silently bring a
        // degraded model back into the streams.
        logger.error(
          { err: normalizeError(err) },
          "Failed to refresh the degraded models"
        );
      })
      .finally(() => {
        refreshing = false;
      });
  }

  return cachedDegradedModelIds;
}
