import type { SaveAgentConfigurationParams } from "@app/lib/resources/agent_resource";

// Canonicalizes agent save params for no-op version detection: `_saveConfiguration` compares the
// current version against the incoming one and skips creating a new version when they are equal
// (see the `save-skips-noop-version` contract). The comparison MUST be conservative — any
// uncertainty about equality falls through to a normal save so a real edit is never silently
// dropped.

// Reconstructed (DB-loaded) actions carry identity and presentation fields the wire save payload
// never sends — at the top level (`id`, `sId`, `internalMCPServerId`, `icon`, `meta`) and nested in
// data-source, table and Dust app entries (`id`, `sId`). Comparing them would make an unchanged tool
// look edited on every save, so they are dropped at every depth.
const ACTION_IDENTITY_KEYS_TO_DROP = new Set([
  "id",
  "sId",
  "internalMCPServerId",
  "icon",
  "meta",
]);

// Action fields whose contents are arbitrary user-controlled data: a tool's input JSON schema
// (keyed by the tool's own property names) and the free-form config map. Their keys can legitimately
// collide with the identity keys above — `jsonSchema.properties.id`, an `additionalConfiguration`
// entry named `icon` — so they are compared verbatim rather than descended into. Dropping a key
// inside them would let a real edit compare equal and be silently skipped, violating the conservative
// requirement of `save-skips-noop-version`. The worst case of comparing verbatim is a redundant save.
const OPAQUE_ACTION_KEYS = new Set(["jsonSchema", "additionalConfiguration"]);

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Projects an MCP action onto the fields that define it for comparison, recursively dropping the
// reconstructed-only identity fields above (except inside the opaque, user-controlled fields, which
// are kept verbatim). Rebuilds objects with a null prototype so an own `__proto__` key (e.g. inside
// a tool's JSON schema) is preserved as data rather than silently reparented — which would otherwise
// let a real schema edit compare equal and be dropped.
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
      result[key] = OPAQUE_ACTION_KEYS.has(key)
        ? value[key]
        : normalizeActionForComparison(value[key]);
    }
    return result;
  }
  return value;
}

// Reduces a save's params to the comparable essence of a configuration version: the fields a new
// version would actually persist, normalized so equal configurations compare equal — optional model
// fields defaulted, collections reduced to sorted identifier lists (order-insensitive), and actions
// projected onto their defining fields and sorted by a stable serialization. The version author is
// intentionally excluded: it is version metadata, not part of the configuration.
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
    tags: params.tags.map((tag) => tag.sId).sort(),
    editors: params.editors.map((editor) => editor.id).sort((a, b) => a - b),
    skills: (params.skills ?? []).map((skill) => skill.sId).sort(),
    // Action names are unique within an agent, so (name, view) is a stable order; `isEqual` then
    // compares the normalized objects regardless of their key order.
    actions: [...(params.actions ?? [])]
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          a.mcpServerViewId.localeCompare(b.mcpServerViewId)
      )
      .map((action) => normalizeActionForComparison(action)),
  };
}
