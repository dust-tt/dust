export const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";

// Fireworks model ids are stored bare (e.g. `glm-5p2`) but legacy `ModelIdType`
// and the Fireworks API both use the full account-scoped path.
export const FIREWORKS_MODEL_PREFIX = "accounts/fireworks/models/";
