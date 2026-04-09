import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import Sqids from "sqids";

const RESOURCE_S_ID_MIN_LENGTH = 10;

const sqids = new Sqids({
  minLength: RESOURCE_S_ID_MIN_LENGTH,
});

// WARNING: These legacy bits are part of the ID encoding scheme and must be preserved to maintain
// backwards compatibility with existing string IDs.
// They were originally used for sharding and region information but are no longer functionally
// needed after migration to cross-region architecture.
export const LEGACY_REGION_BIT = 1; // Previously indicated US region.
const LEGACY_SHARD_BIT = 1;

export const RESOURCES_PREFIX = {
  file: "fil",
  group: "grp",
  // TODO(2024-10-31 flav) Add new prefix for space.
  space: "vlt",
  data_source: "dts",
  data_source_view: "dsv",
  template: "tpl",
  extension: "ext",
  mcp_server_connection: "msc",
  mcp_server_view: "msv",
  remote_mcp_server: "rms",
  tag: "tag",
  transcripts_configuration: "tsc",
  agent_step_content: "asc",
  agent_memory: "amm",
  agent_message_feedback: "amf",
  onboarding_task: "obt",
  programmatic_usage_configuration: "puc",
  credit: "crd",

  // Resource relative to triggers.
  trigger: "trg",
  webhook_source: "whs",
  webhook_sources_view: "wsv",

  // Action (used for tool approval currently).
  mcp_action: "act",

  // Resources relative to the configuration of an MCP server.
  data_source_configuration: "dsc",
  table_configuration: "tbc",
  agent_configuration: "cac",

  // Virtual resources (no database models associated).
  internal_mcp_server: "ims",

  // Skills.
  skill: "skl",

  // Agent suggestions.
  agent_suggestion: "asu",

  // Skill suggestions.
  skill_suggestion: "ssu",

  // Workspace verification.
  workspace_verification_attempt: "wva",

  // Project metadata.
  project_metadata: "pmd",

  // Academy quiz attempts.
  academy_quiz_attempt: "aqz",
  academy_chapter_visit: "acv",

  // Sandboxes.
  sandbox: "sbx",

  // Project todos.
  project_todo_state: "pts",

  // Butler
  user_project_digest: "pje",
  conversation_butler_suggestion: "cbs",

  // Conversation branches.
  conversation_branch: "cbr",

  // Provider credentials (BYOK).
  provider_credential: "pcr",
} as const;

export const CROSS_WORKSPACE_RESOURCES_WORKSPACE_ID: ModelId = 0;

const ALL_RESOURCES_PREFIXES = Object.values<string>(RESOURCES_PREFIX);

type ResourceNameType = keyof typeof RESOURCES_PREFIX;

export type ResourceSId = {
  [key in keyof typeof RESOURCES_PREFIX]: `${(typeof RESOURCES_PREFIX)[key]}_${string}`;
}[keyof typeof RESOURCES_PREFIX];

const sIdCache = new Map<string, string>();

export function getResourcePrefix(resourceName: ResourceNameType): string {
  return RESOURCES_PREFIX[resourceName];
}

export function dangerouslyMakeSIdWithCustomFirstPrefix(
  resourceName: "internal_mcp_server",
  {
    id,
    workspaceId,
    firstPrefix,
  }: {
    id: ModelId;
    workspaceId: ModelId;
    firstPrefix: number;
  }
): string {
  return _makeSId(resourceName, {
    id,
    workspaceId,
    customFirstPrefix: firstPrefix,
  });
}

export function makeSId(
  resourceName: Exclude<ResourceNameType, "internal_mcp_server">,
  {
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }
): string {
  return _makeSId(resourceName, {
    id,
    workspaceId,
  });
}

function _makeSId(
  resourceName: ResourceNameType,
  {
    id,
    workspaceId,
    customFirstPrefix = LEGACY_REGION_BIT,
    customSecondPrefix = LEGACY_SHARD_BIT,
  }: {
    id: ModelId;
    workspaceId: ModelId;
    customFirstPrefix?: number;
    customSecondPrefix?: number;
  }
): string {
  const idsToEncode = [customFirstPrefix, customSecondPrefix, workspaceId, id];

  // Computing the sId is relatively expensive and we have a lot of them.
  // We cache them in memory to avoid recomputing them, they are immutable.
  const key = `${resourceName}_${idsToEncode.join("_")}`;
  const cached = sIdCache.get(key);
  if (cached) {
    return cached;
  }

  const prefix = RESOURCES_PREFIX[resourceName];
  if (!prefix) {
    throw new Error(`Invalid resource name: ${resourceName}`);
  }

  const sId = `${prefix}_${sqids.encode(idsToEncode)}`;
  sIdCache.set(key, sId);
  return sId;
}

export function getIdsFromSId(sId: string): Result<
  {
    workspaceModelId: ModelId;
    resourceModelId: ModelId;
  },
  Error
> {
  const [resourcePrefix, sIdWithoutPrefix] = sId.split("_");

  if (!ALL_RESOURCES_PREFIXES.includes(resourcePrefix)) {
    logger.error(
      { sId, resourcePrefix },
      "Invalid resource prefix in string Id (log with prefix)"
    );
    return new Err(new Error("Invalid resource prefix in string Id"));
  }

  if (sIdWithoutPrefix.length < RESOURCE_S_ID_MIN_LENGTH) {
    return new Err(new Error("Invalid string Id length"));
  }

  try {
    const ids = sqids.decode(sIdWithoutPrefix);

    if (ids.length !== 4) {
      return new Err(new Error("Invalid decoded string Id length"));
    }

    const [, , workspaceId, resourceId] = ids;

    return new Ok({
      workspaceModelId: workspaceId,
      resourceModelId: resourceId,
    });
  } catch (error) {
    return new Err(
      error instanceof Error ? error : new Error("Failed to decode string Id")
    );
  }
}

export function getResourceIdFromSId(sId: string): ModelId | null {
  const sIdsRes = getIdsFromSId(sId);
  if (sIdsRes.isErr()) {
    logger.error(
      { sId, error: sIdsRes.error },
      "Failed to get IDs from string Id"
    );

    return null;
  }

  return sIdsRes.value.resourceModelId;
}

export function isResourceSId(
  resourceName: ResourceNameType,
  sId: string
): boolean {
  return sId.startsWith(`${RESOURCES_PREFIX[resourceName]}_`);
}

export function getResourceNameAndIdFromSId(sId: string): {
  resourceName: ResourceNameType;
  sId: string;
  workspaceModelId: ModelId;
  resourceModelId: ModelId;
} | null {
  const resourceName = (
    Object.keys(RESOURCES_PREFIX) as ResourceNameType[]
  ).find((name) => isResourceSId(name, sId));

  if (!resourceName) {
    return null;
  }

  const sIdRes = getIdsFromSId(sId);
  // Silently ignore errors.
  if (sIdRes.isErr()) {
    return null;
  }

  return { resourceName, sId, ...sIdRes.value };
}
