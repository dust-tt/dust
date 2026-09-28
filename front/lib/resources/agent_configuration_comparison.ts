import type { SaveAgentConfigurationParams } from "@app/lib/resources/agent_resource";

// No-op version detection (`save-skips-noop-version` contract): the incoming config is compared
// against the current version and no new version is created when they are equal. The comparison MUST
// be conservative — on any doubt it falls through to a save so a real edit is never dropped; the
// worst case is a redundant save.

// Identity/presentation fields the DB-reconstructed action carries but the wire payload never sends,
// at every depth (nested in data-source/table/Dust-app entries). Dropped so an unchanged tool
// compares equal.
const ACTION_IDENTITY_KEYS_TO_DROP = new Set([
  "id",
  "sId",
  "internalMCPServerId",
  "icon",
  "meta",
]);

// Fields holding arbitrary user data whose keys can collide with the identity keys above
// (`jsonSchema.properties.id`, an `additionalConfiguration` entry named `icon`). Compared verbatim,
// never descended into — dropping a key inside them could silently skip a real edit.
const OPAQUE_ACTION_KEYS = new Set(["jsonSchema", "additionalConfiguration"]);

// A reconstructed `dustAppConfiguration` also carries the app's presentation fields (`name`,
// `description`) the PATCH payload never sends — only `appId`/`appWorkspaceId`/`type` identify it.
// Dropped so an unchanged Dust-app tool compares equal (they are derived from the app, not editable
// here, so a real change is always reflected by `appId`).
const DUST_APP_CONFIG_KEY = "dustAppConfiguration";
const DUST_APP_PRESENTATION_KEYS_TO_DROP = new Set(["name", "description"]);

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Projects an action onto its defining fields, recursively dropping identity keys (opaque keys kept
// verbatim). Null-prototype objects preserve an own `__proto__` key as data instead of reparenting.
function normalizeActionForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeActionForComparison);
  }
  if (isRecordValue(value)) {
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value)) {
      if (ACTION_IDENTITY_KEYS_TO_DROP.has(key)) {
        continue;
      }
      if (OPAQUE_ACTION_KEYS.has(key)) {
        result[key] = value[key];
      } else if (key === DUST_APP_CONFIG_KEY && isRecordValue(value[key])) {
        result[key] = normalizeDustAppConfigForComparison(value[key]);
      } else {
        result[key] = normalizeActionForComparison(value[key]);
      }
    }
    return result;
  }
  return value;
}

// Projects a `dustAppConfiguration` onto the fields the wire payload carries, dropping the
// reconstructed-only identity and presentation fields.
function normalizeDustAppConfigForComparison(
  value: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(value)) {
    if (
      ACTION_IDENTITY_KEYS_TO_DROP.has(key) ||
      DUST_APP_PRESENTATION_KEYS_TO_DROP.has(key)
    ) {
      continue;
    }
    result[key] = value[key];
  }
  return result;
}

// Reduces save params to the fields a version persists, normalized so equal configs compare equal:
// optional fields defaulted, collections sorted (order-insensitive), actions projected and sorted.
// The version author is excluded — it is version metadata, not configuration.
export function canonicalizeSaveParamsForComparison(
  params: SaveAgentConfigurationParams
): Record<string, unknown> {
  return {
    name: params.name,
    description: params.description,
    instructions: params.instructions ?? null,
    instructionsHtml: params.instructionsHtml ?? null,
    pictureUrl: params.pictureUrl,
    status: params.status,
    scope: params.scope,
    model: {
      providerId: params.model.providerId,
      modelId: params.model.modelId,
      temperature: params.model.temperature,
      reasoningEffort: params.model.reasoningEffort ?? null,
      responseFormat: params.model.responseFormat ?? null,
      metaData: params.model.metaData ?? null,
    },
    templateId: params.templateId ?? null,
    requestedSpaceIds: [...params.requestedSpaceIds].sort((a, b) => a - b),
    reinforcement: params.reinforcement ?? "auto",
    ignoreCreditSpendThresholdAlert:
      params.ignoreCreditSpendThresholdAlert ?? false,
    tags: params.tags.map((tag) => tag.sId).sort(),
    editors: params.editors.map((editor) => editor.id).sort((a, b) => a - b),
    skills: (params.skills ?? []).map((skill) => skill.sId).sort(),
    // (name, view) is a stable sort key: action names are unique within an agent.
    actions: [...(params.actions ?? [])]
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          a.mcpServerViewId.localeCompare(b.mcpServerViewId)
      )
      .map((action) => normalizeActionForComparison(action)),
  };
}
